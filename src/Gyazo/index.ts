import { Config, Effect, Schedule, Schema } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

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

export class Gyazo extends Effect.Service<Gyazo>()('Gyazo', {
  effect: Effect.gen(function* () {
    const gyazoToken = yield* Config.string('GYAZO_TOKEN');
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const uploadOnce = (imagePath: string) =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(imagePath);

        if (!exists) {
          return yield* new GyazoError({
            message: `Image file not found: ${imagePath}`,
          });
        }

        const fileContent = yield* fs.readFile(imagePath);
        const fileName = path.basename(imagePath);

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

        const parsed = yield* Schema.decodeUnknown(UploadResponse)(json).pipe(
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

        const parsed = yield* Schema.decodeUnknown(ImageResponse)(json).pipe(
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
          Effect.retry(
            Schedule.recurs(3).pipe(Schedule.addDelay(() => '3 seconds')),
          ),
          Effect.tapError(e =>
            Effect.logWarning(
              `Gyazo upload failed after retries: ${e.message}`,
            ),
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
            schedule: Schedule.intersect(
              Schedule.exponential('2 seconds'),
              Schedule.recurs(5),
            ),
            while: e => e._tag === 'OcrPendingError',
          }),
          Effect.tapError(e =>
            Effect.logWarning(`OCR fetch failed after retries: ${e.message}`),
          ),
        ),
    };
  }),
}) {}

class GyazoError extends Schema.TaggedError<GyazoError>()('GyazoError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/** OCR がまだ完了していない場合のエラー（リトライ対象） */
class OcrPendingError extends Schema.TaggedError<OcrPendingError>()(
  'OcrPendingError',
  { message: Schema.String },
) {}
