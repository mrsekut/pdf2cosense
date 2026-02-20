import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as Path from '@effect/platform/Path';
import { Effect, Layer } from 'effect';
import {
  getPdfsNeedingConversion,
  getDirsWithoutIsbn,
} from './workspace/index.ts';
import { pdfToImages } from './phases/pdfToImages.ts';
import { imageDirToProject } from './phases/imageDirToProject.ts';
import { AppConfig } from './config/AppConfig.ts';
import { Gyazo } from './services/Gyazo/index.ts';
import {
  IsbnSearch,
  FallbackIsbnSearchLayer,
} from './services/IsbnSearch/index.ts';

const WORKSPACE_DIR = './workspace';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    // Phase 1: PDF → 画像変換
    const pdfPaths = yield* getPdfsNeedingConversion(WORKSPACE_DIR);
    if (pdfPaths.length > 0) {
      yield* Effect.logInfo(`Found ${pdfPaths.length} PDF file(s) to convert`);
      yield* Effect.forEach(pdfPaths, pdfToImages, { concurrency: 1 });
    }

    // Phase 2: ISBN 検索
    const dirsNeedingIsbn = yield* getDirsWithoutIsbn(WORKSPACE_DIR);
    if (dirsNeedingIsbn.length > 0) {
      yield* Effect.logInfo(
        `Found ${dirsNeedingIsbn.length} directory(s) needing ISBN`,
      );
      yield* Effect.forEach(
        dirsNeedingIsbn,
        imageDir =>
          Effect.gen(function* () {
            const dirName = path.basename(imageDir);
            yield* Effect.logInfo(`Searching ISBN for: ${dirName}`);

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

            // TODO: PR3 で .isbn ファイル保存に置き換え
            yield* imageDirToProject(imageDir, result.isbn);
          }),
        { concurrency: 1, discard: true },
      );
    }

    // TODO: PR3-5 で Phase 3, 4 を実装

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
