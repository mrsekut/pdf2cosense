import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as Path from '@effect/platform/Path';
import { Effect, Layer } from 'effect';
import { getPdfPaths, getImageDirs } from './files/files.ts';
import { pdfToImages } from './features/pdfToImages/index.ts';
import { imageDirToProject } from './features/imageDirToProject/index.ts';
import { AppConfig } from './features/imageToJson/AppConfig.ts';
import { Gyazo } from './Gyazo/index.ts';
import { IsbnSearch, FallbackIsbnSearchLayer } from './IsbnSearch/index.ts';

const WORKSPACE_DIR = './workspace';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    // 1. PDF があれば画像に変換
    const pdfPaths = yield* getPdfPaths(WORKSPACE_DIR);
    if (pdfPaths.length > 0) {
      yield* Effect.logInfo(`Found ${pdfPaths.length} PDF file(s)`);
      yield* Effect.forEach(pdfPaths, pdfToImages, { concurrency: 1 });
    }

    // 2. 画像ディレクトリを検出
    const imageDirs = yield* getImageDirs(WORKSPACE_DIR);
    yield* Effect.logInfo(`Found ${imageDirs.length} image directory(s)`);

    if (imageDirs.length === 0) {
      yield* Effect.logInfo('No image directories found.');
      return;
    }

    // 3. 各ディレクトリに対して処理
    yield* Effect.forEach(
      imageDirs,
      imageDir =>
        Effect.gen(function* () {
          const dirName = path.basename(imageDir);
          yield* Effect.logInfo(`Searching ISBN for: ${dirName}`);

          // タイトルから ISBN を検索
          const isbnSearch = yield* IsbnSearch;
          const result = yield* isbnSearch.searchByTitle(dirName).pipe(
            Effect.catchTag('IsbnNotFoundError', e => {
              return Effect.logWarning(
                `ISBN not found for "${e.title}", skipping...`,
              ).pipe(Effect.as(null));
            }),
            Effect.catchTag('ApiError', e => {
              return Effect.logError(`API error: ${e.message}`).pipe(
                Effect.as(null),
              );
            }),
          );

          if (!result) return;

          yield* Effect.logInfo(
            `Found: "${result.title}" by ${result.authors.join(', ')} (ISBN: ${result.isbn})`,
          );

          yield* imageDirToProject(imageDir, result.isbn);
        }),
      { concurrency: 1, discard: true },
    );

    yield* Effect.logInfo('All done!');
  }),
);

// Layer
const MainLayer = Layer.mergeAll(
  AppConfig.Default,
  Gyazo.Default,
  FallbackIsbnSearchLayer,
);

// CLI entry point
const cli = Command.run(mainCommand, {
  name: 'pdf2cosense',
  version: '0.1.0',
});

cli(process.argv).pipe(
  Effect.provide(MainLayer),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
);
