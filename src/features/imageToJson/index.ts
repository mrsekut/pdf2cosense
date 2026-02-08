import { Effect, Option, pipe, Array, Order } from 'effect';
import { AppConfig } from './AppConfig.ts';
import { generatePage } from './generatePage.ts';
import { createProfilePage, saveJson } from './renderPage.ts';
import type { Project } from '../types.ts';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

/**
 * 画像ディレクトリから JSON を生成
 * TODO: clean
 */
export const imagesToJson = (imageDir: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;

    yield* Effect.logInfo(`Processing images in: ${imageDir}`);

    // 画像一覧を取得
    const images = yield* getImages(imageDir);
    yield* Effect.logInfo(`Found ${images.length} image(s)`);

    // 順次処理でページ生成（rate limit 対策）
    const pages = yield* Effect.forEach(
      images.map((image, index) => ({ image, index })),
      ({ image, index }) =>
        generatePage(index, image, images.length).pipe(
          Effect.tap(() =>
            Effect.logDebug(`Processed page ${index + 1}/${images.length}`),
          ),
          Effect.option,
        ),
      { concurrency: 1 },
    ).pipe(
      Effect.map(results =>
        results.filter(r => Option.isSome(r)).map(r => r.value),
      ),
    );

    yield* Effect.logInfo(`Generated ${pages.length} page(s)`);

    // プロファイルページを追加
    const profilePage = yield* createProfilePage(config.profile);
    const pagesWithProfile = [profilePage, ...pages];

    // JSON 保存
    const jsonPath = `${imageDir}-ocr.json`;
    const project: Project = { pages: pagesWithProfile };
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
