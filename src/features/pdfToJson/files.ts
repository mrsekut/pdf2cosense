import { Effect } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import { PdfToJsonError } from './types.ts';

/**
 * workspace 内の PDF ファイル一覧を取得
 */
export const getPdfPaths = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir).pipe(
      Effect.mapError(
        cause =>
          new PdfToJsonError({
            message: `Failed to read directory: ${workspaceDir}`,
            cause,
          }),
      ),
    );

    const pdfFiles = entries.filter(entry =>
      entry.toLowerCase().endsWith('.pdf'),
    );

    return pdfFiles.map(file => path.join(workspaceDir, file));
  });

/**
 * workspace 内の画像ディレクトリ一覧を取得
 */
export const getImageDirs = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir).pipe(
      Effect.mapError(
        cause =>
          new PdfToJsonError({
            message: `Failed to read directory: ${workspaceDir}`,
            cause,
          }),
      ),
    );

    const dirs: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(workspaceDir, entry);
      const stat = yield* fs.stat(fullPath).pipe(Effect.option);

      if (stat._tag === 'Some' && stat.value.type === 'Directory') {
        dirs.push(fullPath);
      }
    }

    return dirs;
  });

/**
 * ディレクトリ内の PNG ファイル一覧を取得（ソート済み）
 */
export const getImages = (dirPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(dirPath).pipe(
      Effect.mapError(
        cause =>
          new PdfToJsonError({
            message: `Failed to read directory: ${dirPath}`,
            cause,
          }),
      ),
    );

    const pngFiles = entries
      .filter(entry => entry.toLowerCase().endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('.png', ''), 10);
        const numB = parseInt(b.replace('.png', ''), 10);
        return numA - numB;
      });

    return pngFiles.map(file => path.join(dirPath, file));
  });
