import { Duration, Effect, pipe, Array, Order } from 'effect';
import { AppConfig } from '../../config/AppConfig.ts';
import { uploadImage, fetchOcrText } from './generatePage.ts';
import { renderPage, saveJson } from './renderPage.ts';
import { createProfilePage } from './createProfilePage.ts';
import type { Project } from '../../services/Cosense/types.ts';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

/**
 * 画像ディレクトリから JSON を生成
 */
export const imagesToJson = (imageDir: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;

    yield* Effect.logInfo(`Processing images in: ${imageDir}`);

    // 画像一覧を取得
    const images = yield* getImages(imageDir);
    yield* Effect.logInfo(`Found ${images.length} image(s)`);

    // Phase 1: Upload
    yield* Effect.logInfo('Phase 1: Uploading images...');
    const imageIds = yield* Effect.forEach(
      images,
      (image, index) => uploadImage(index, image, images.length),
      { concurrency: 50 },
    );

    // Phase 2: Wait for OCR processing
    yield* Effect.logInfo('Waiting 10s for OCR processing...');
    yield* Effect.sleep(Duration.seconds(10));

    // Phase 3: OCR fetch
    yield* Effect.logInfo('Phase 2: Fetching OCR texts...');
    const ocrTexts = yield* Effect.forEach(
      imageIds,
      (imageId, index) => fetchOcrText(index, imageId, images.length),
      { concurrency: 50 },
    );

    // Phase 4: Render pages
    const pages = imageIds.map((imageId, index) =>
      renderPage(index, images.length, imageId, ocrTexts[index] ?? ''),
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
