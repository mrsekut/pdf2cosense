import { Effect } from 'effect';
import { Gyazo } from '../../Gyazo/index.ts';

/**
 * Gyazo にアップロードして imageId を返す
 */
export const uploadImage = (
  index: number,
  imagePath: string,
  totalPages: number,
) =>
  Effect.gen(function* () {
    const gyazo = yield* Gyazo;
    const tag = `[${index + 1}/${totalPages}]`;
    const fileName = imagePath.split('/').pop() ?? imagePath;

    yield* Effect.logInfo(`${tag} Uploading: ${fileName}`);
    const imageId = yield* gyazo.upload(imagePath);
    yield* Effect.logInfo(`${tag} Uploaded`);

    return imageId;
  });

/**
 * OCR テキストを取得。失敗時は空文字を返す
 */
export const fetchOcrText = (
  index: number,
  imageId: string,
  totalPages: number,
) =>
  Effect.gen(function* () {
    const gyazo = yield* Gyazo;
    const tag = `[${index + 1}/${totalPages}]`;

    yield* Effect.logInfo(`${tag} Fetching OCR text...`);
    const ocrText = yield* gyazo.getOcrText(imageId).pipe(
      Effect.catchAll(() =>
        Effect.logWarning(
          `${tag} OCR unavailable, continuing without OCR text`,
        ).pipe(Effect.as('')),
      ),
    );
    yield* Effect.logInfo(`${tag} OCR done`);

    return ocrText;
  });
