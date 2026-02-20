import { Duration, Effect, pipe, Array, Order } from 'effect';
import { AppConfig } from '../../config/AppConfig.ts';
import { uploadImage, fetchOcrText } from './generatePage.ts';
import { renderPage, saveJson } from './renderPage.ts';
import { createProfilePage } from './createProfilePage.ts';
import type { Project } from '../../services/Cosense/types.ts';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

const BATCH_SIZE = 50;

/**
 * 画像ディレクトリから JSON を生成
 * バッチ処理: BATCH_SIZE 枚ずつ upload → 10s wait → OCR fetch
 */
export const imagesToJson = (imageDir: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;

    yield* Effect.logInfo(`Processing images in: ${imageDir}`);

    const images = yield* getImages(imageDir);
    yield* Effect.logInfo(`Found ${images.length} image(s)`);

    const imageChunks = Array.chunksOf(images, BATCH_SIZE);
    const allImageIds: string[] = [];
    const allOcrTexts: string[] = [];

    for (const [chunkIndex, chunk] of imageChunks.entries()) {
      const offset = chunkIndex * BATCH_SIZE;

      // Upload batch
      yield* Effect.logInfo(
        `Batch ${chunkIndex + 1}/${imageChunks.length}: Uploading ${chunk.length} image(s)...`,
      );
      const chunkIds = yield* Effect.forEach(
        chunk,
        (image, index) => uploadImage(offset + index, image, images.length),
        { concurrency: 'unbounded' },
      );
      allImageIds.push(...chunkIds);

      // Wait for OCR processing
      yield* Effect.logInfo('Waiting 10s for OCR processing...');
      yield* Effect.sleep(Duration.seconds(10));

      // OCR fetch batch
      yield* Effect.logInfo(
        `Batch ${chunkIndex + 1}/${imageChunks.length}: Fetching OCR texts...`,
      );
      const chunkOcrTexts = yield* Effect.forEach(
        chunkIds,
        (imageId, index) =>
          fetchOcrText(offset + index, imageId, images.length),
        { concurrency: 'unbounded' },
      );
      allOcrTexts.push(...chunkOcrTexts);
    }

    // Render pages
    const pages = allImageIds.map((imageId, index) =>
      renderPage(index, images.length, imageId, allOcrTexts[index] ?? ''),
    );

    yield* Effect.logInfo(`Generated ${pages.length} page(s)`);

    // プロファイルページを追加（設定されている場合のみ）
    const pagesWithProfile = config.profile
      ? [yield* createProfilePage(config.profile), ...pages]
      : pages;

    // JSON 保存
    const jsonPath = `${imageDir}-ocr.json`;
    const project = { pages: pagesWithProfile } satisfies Project;
    yield* saveJson(jsonPath, project);

    yield* Effect.logInfo(`Saved JSON to ${jsonPath}`);

    return jsonPath;
  });

/**
 * ディレクトリ内の PNG ファイル一覧を取得（ソート済み）
 */
const getImages = (dirPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(dirPath);

    const pngFiles = pipe(
      entries,
      Array.filter(e => e.toLowerCase().endsWith('.png')),
      Array.sort(
        Order.mapInput(Order.number, (s: string) =>
          parseInt(s.replace(/\.png$/i, ''), 10),
        ),
      ),
    );

    return pngFiles.map(file => path.join(dirPath, file));
  });
