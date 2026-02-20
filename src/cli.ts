import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import {
  getPdfsNeedingConversion,
  getDirsWithoutIsbn,
  getBooksWithoutJson,
} from './workspace/index.ts';
import { pdfToImages } from './phases/pdfToImages.ts';
import { searchAndSaveIsbn } from './phases/isbnSearch.ts';
import { imagesToJson } from './phases/imageToJson/index.ts';
import { AppConfig } from './config/AppConfig.ts';
import { Gyazo } from './services/Gyazo/index.ts';
import { FallbackIsbnSearchLayer } from './services/IsbnSearch/index.ts';

const WORKSPACE_DIR = './workspace';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    // Phase 1: PDF → 画像変換
    const pdfPaths = yield* getPdfsNeedingConversion(WORKSPACE_DIR);
    if (pdfPaths.length > 0) {
      yield* Effect.logInfo(`Found ${pdfPaths.length} PDF file(s) to convert`);
      yield* Effect.forEach(pdfPaths, pdfToImages, { concurrency: 1 });
    }

    // Phase 2: ISBN 検索 + .isbn 保存
    const dirsNeedingIsbn = yield* getDirsWithoutIsbn(WORKSPACE_DIR);
    if (dirsNeedingIsbn.length > 0) {
      yield* Effect.logInfo(
        `Found ${dirsNeedingIsbn.length} directory(s) needing ISBN`,
      );
      yield* Effect.forEach(dirsNeedingIsbn, searchAndSaveIsbn, {
        concurrency: 1,
      });
    }

    // --- ここから放置可能 ---

    // Phase 3: Gyazo upload + OCR → JSON
    const books = yield* getBooksWithoutJson(WORKSPACE_DIR);
    if (books.length > 0) {
      yield* Effect.logInfo(`Found ${books.length} book(s) needing JSON`);
      yield* Effect.forEach(books, b => imagesToJson(b.imageDir), {
        concurrency: 1,
      });
    }

    // TODO: Phase 4 (Cosense インポート) は PR5 で実装

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
