import { Duration, Effect } from 'effect';
import { Gyazo } from './services/index.ts';
import { renderPage } from './renderPage.ts';
import type { Page } from './types.ts';
import { GyazoError } from './types.ts';

/**
 * 画像から Page を生成
 * 1. Gyazo にアップロード
 * 2. 10秒待機（OCR 処理待ち）
 * 3. OCR テキスト取得
 * 4. Page を生成
 */
export const generatePage = (
  index: number,
  imagePath: string,
  totalPages: number,
): Effect.Effect<Page, GyazoError, Gyazo> =>
  Effect.gen(function* () {
    const gyazo = yield* Gyazo;

    // 1. Gyazo にアップロード
    const imageId = yield* gyazo.upload(imagePath);

    // 2. 10秒待機（OCR 処理待ち）
    yield* Effect.sleep(Duration.seconds(10));

    // 3. OCR テキスト取得
    const ocrText = yield* gyazo.getOcrText(imageId);

    // 4. Page を生成
    return renderPage(index, totalPages, imageId, ocrText);
  });
