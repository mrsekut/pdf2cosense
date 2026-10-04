import {
  Config,
  Context,
  Effect,
  Layer,
  Schedule,
  Schema,
  FileSystem as Fs,
  Path,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** これを超える画像は JPEG に変換してからアップロードする（33.7MB の PNG は通り、42MB は 413 になった） */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

// ===== Response Schemas =====

const UploadResponse = Schema.Struct({
  image_id: Schema.String,
});

const ImageResponse = Schema.Struct({
  image_id: Schema.String,
  metadata: Schema.Struct({
    ocr: Schema.optional(
      Schema.Struct({
        locale: Schema.Unknown,
        description: Schema.String,
      }),
    ),
  }),
});

// ===== Service Definition =====

const make = Effect.gen(function* () {
  const gyazoToken = yield* Config.String('GYAZO_TOKEN');
  const fs = yield* Fs.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  /** アップロード用に画像を読み込む。上限を超える場合は sips で JPEG に変換したものを返す */
  const prepareImageForUpload = (imagePath: string) =>
    Effect.gen(function* () {
      const size = Number((yield* fs.stat(imagePath)).size);
      const fileName = path.basename(imagePath);
      if (size <= MAX_UPLOAD_BYTES) {
        return { content: yield* fs.readFile(imagePath), fileName };
      }

      const tmpDir = yield* fs.makeTempDirectoryScoped();
      const jpegName = fileName.replace(/\.[^.]+$/, '.jpg');
      const jpegPath = path.join(tmpDir, jpegName);
      const exitCode = yield* spawner.exitCode(
        ChildProcess.make(
          'sips',
          [
            '-s',
            'format',
            'jpeg',
            '-s',
            'formatOptions',
            '85',
            imagePath,
            '--out',
            jpegPath,
          ],
          { stdout: 'ignore' },
        ),
      );
      if (exitCode !== 0) {
        return yield* new GyazoError({
          message: `sips failed to convert ${imagePath} to JPEG (exit ${exitCode})`,
        });
      }

      const content = yield* fs.readFile(jpegPath);
      yield* Effect.logInfo(
        `Converted ${fileName} to JPEG: ${(size / 1024 / 1024).toFixed(1)}MB -> ${(content.length / 1024 / 1024).toFixed(1)}MB`,
      );
      return { content, fileName: jpegName };
    }).pipe(Effect.scoped);

  const uploadOnce = (imagePath: string) =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(imagePath);

      if (!exists) {
        return yield* new GyazoError({
          message: `Image file not found: ${imagePath}`,
        });
      }

      const { content: fileContent, fileName } =
        yield* prepareImageForUpload(imagePath);

      const formData = new FormData();
      formData.append('access_token', gyazoToken);
      formData.append(
        'imagedata',
        new Blob([new Uint8Array(fileContent)]),
        fileName,
      );

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch('https://upload.gyazo.com/api/upload', {
            method: 'POST',
            body: formData,
          }),
        catch: cause =>
          new GyazoError({ message: 'Failed to upload to Gyazo', cause }),
      });

      if (!response.ok) {
        return yield* new GyazoError({
          message: `Gyazo upload failed: ${response.status} ${response.statusText}`,
        });
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: cause =>
          new GyazoError({
            message: 'Failed to parse upload response',
            cause,
          }),
      });

      const parsed = yield* Schema.decodeUnknownEffect(UploadResponse)(
        json,
      ).pipe(
        Effect.mapError(
          cause =>
            new GyazoError({
              message: 'Invalid upload response format',
              cause,
            }),
        ),
      );

      return parsed.image_id;
    });

  const getOcrTextOnce = (imageId: string) =>
    Effect.gen(function* () {
      const url = `https://api.gyazo.com/api/images/${imageId}?access_token=${gyazoToken}`;

      const response = yield* Effect.tryPromise({
        try: () => fetch(url),
        catch: cause =>
          new GyazoError({ message: 'Failed to fetch image data', cause }),
      });

      if (!response.ok) {
        return yield* new GyazoError({
          message: `Gyazo API failed: ${response.status} ${response.statusText}`,
        });
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: cause =>
          new GyazoError({
            message: 'Failed to parse image response',
            cause,
          }),
      });

      const parsed = yield* Schema.decodeUnknownEffect(ImageResponse)(
        json,
      ).pipe(
        Effect.mapError(
          cause =>
            new GyazoError({
              message: 'Invalid image response format',
              cause,
            }),
        ),
      );

      const ocrText = parsed.metadata.ocr?.description ?? '';

      // OCR がまだ完了していない場合はリトライ対象エラー
      if (ocrText.trim() === '') {
        return yield* new OcrPendingError({
          message: 'OCR not yet available',
        });
      }

      return ocrText;
    });

  return {
    upload: (imagePath: string) =>
      uploadOnce(imagePath).pipe(
        Effect.retry({
          schedule: Schedule.exponential('2 seconds'),
          times: 5,
        }),
        Effect.tapError(e =>
          Effect.logWarning(`Gyazo upload failed after retries: ${e.message}`),
        ),
      ),

    getOcrText: (imageId: string) =>
      getOcrTextOnce(imageId).pipe(
        // GyazoError (スキーマエラー等) は即失敗、OcrPendingError のみリトライ
        Effect.tapError(e =>
          e._tag === 'GyazoError'
            ? Effect.logError(`OCR fetch error (not retryable): ${e.message}`)
            : Effect.void,
        ),
        Effect.retry({
          schedule: Schedule.exponential('2 seconds'),
          times: 5,
          while: e => e._tag === 'OcrPendingError',
        }),
        Effect.tapError(e =>
          Effect.logWarning(`OCR fetch failed after retries: ${e.message}`),
        ),
      ),
  };
});

export class Gyazo extends Context.Service<Gyazo>()('Gyazo', { make }) {
  static readonly layer = Layer.effect(this, this.make);
}

class GyazoError extends Schema.TaggedError<GyazoError>()('GyazoError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/** OCR がまだ完了していない場合のエラー（リトライ対象） */
class OcrPendingError extends Schema.TaggedError<OcrPendingError>()(
  'OcrPendingError',
  { message: Schema.String },
) {}
