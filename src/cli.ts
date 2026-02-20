import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import {
  getPdfsNeedingConversion,
  getDirsWithoutIsbn,
  getBooksWithoutJson,
  getJsonPaths,
} from './workspace/index.ts';
import { pdfToImages } from './phases/pdfToImages.ts';
import { searchAndSaveIsbn } from './phases/isbnSearch.ts';
import { imagesToJson } from './phases/imageToJson/index.ts';
import { importToCosense } from './phases/cosenseImport.ts';
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
      yield* Effect.forEach(pdfPaths, pdfToImages, { concurrency: 3 });
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

    // Phase 3: Gyazo upload + OCR → JSON
    const books = yield* getBooksWithoutJson(WORKSPACE_DIR);
    if (books.length > 0) {
      yield* Effect.logInfo(`Found ${books.length} book(s) needing JSON`);
      yield* Effect.forEach(books, b => imagesToJson(b.imageDir), {
        concurrency: 1,
      });
    }

    // Phase 4: Cosense インポート
    const jsonPaths = yield* getJsonPaths(WORKSPACE_DIR);
    const createdProjects: string[] = [];
    if (jsonPaths.length > 0) {
      yield* Effect.logInfo(`Found ${jsonPaths.length} JSON file(s) to import`);
      const results = yield* Effect.forEach(jsonPaths, importToCosense, {
        concurrency: 1,
      });
      createdProjects.push(...results);
    }

    yield* Effect.logInfo('All done!');
    if (createdProjects.length > 0) {
      yield* Effect.logInfo('Created projects:');
      for (const name of createdProjects) {
        yield* Effect.logInfo(`  https://scrapbox.io/${name}/`);
      }
    }
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
