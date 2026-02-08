import { Effect, Array, Order, pipe } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

/**
 * workspace 内の PDF ファイル一覧を取得
 */
export const getPdfPaths = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir);
    const pdfFiles = entries.filter(e => e.toLowerCase().endsWith('.pdf'));

    return pdfFiles.map(file => path.join(workspaceDir, file));
  });

/**
 * workspace 内の画像ディレクトリ一覧を取得
 */
export const getImageDirs = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir);
    const fullPaths = entries.map(entry => path.join(workspaceDir, entry));

    return yield* Effect.filter(fullPaths, fullPath =>
      fs.stat(fullPath).pipe(
        Effect.map(stat => stat.type === 'Directory'),
        Effect.orElseSucceed(() => false),
      ),
    );
  });

/**
 * ディレクトリ内の PNG ファイル一覧を取得（ソート済み）
 */
export const getImages = (dirPath: string) =>
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
