import { Config, Effect, Schedule, Schema } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import { GyazoError } from '../pdfToJson/types.ts';

// ===== Response Schemas =====

const UploadResponse = Schema.Struct({
  image_id: Schema.String,
});

const ImageResponse = Schema.Struct({
  image_id: Schema.String,
  ocr: Schema.optional(
    Schema.Struct({
      locale: Schema.Unknown,
      description: Schema.String,
    }),
  ),
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

        const ocrText = parsed.ocr?.description ?? '';

        // OCR がまだ完了していない場合はエラーにしてリトライ
        if (ocrText.trim() === '') {
          return yield* new GyazoError({
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
          Effect.retry(
            Schedule.intersect(
              Schedule.exponential('2 seconds'),
              Schedule.recurs(5),
            ),
          ),
          Effect.tapError(e =>
            Effect.logWarning(`OCR fetch failed after retries: ${e.message}`),
          ),
        ),
    };
  }),
}) {}
