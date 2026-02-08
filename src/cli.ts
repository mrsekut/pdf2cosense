import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as Path from '@effect/platform/Path';
import { Terminal } from '@effect/platform';
import { Effect, Layer } from 'effect';
import { getPdfPaths, getImageDirs } from './features/pdfToJson/files.ts';
import { pdfToImages } from './features/pdfToImages/index.ts';
import { imageDirToProject } from './features/pdfToJson/imageDirToProject.ts';
import { AppConfig } from './features/imageToJson/AppConfig.ts';
import { Gyazo } from './Gyazo/index.ts';

const WORKSPACE_DIR = './workspace';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
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

          // ISBN を問い合わせ
          yield* terminal.display(`Enter ISBN for ${dirName}: `);
          const isbn = yield* terminal.readLine;

          if (!isbn.trim()) {
            yield* Effect.logWarning('Skipped (no ISBN provided)');
            return;
          }

          yield* imageDirToProject(imageDir, isbn.trim());
        }),
      { concurrency: 1, discard: true },
    );

    yield* Effect.logInfo('All done!');
  }),
);

// Layer
const MainLayer = Layer.mergeAll(AppConfig.Default, Gyazo.Default);

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
