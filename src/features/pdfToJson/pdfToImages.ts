import { Effect } from 'effect';
import { Command } from '@effect/platform';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import { MutoolError } from './types.ts';

/**
 * mutool コマンドの存在確認
 */
const hasMutool = Effect.gen(function* () {
  const command = Command.make('mutool', '-v').pipe(
    Command.stderr('pipe'),
    Command.stdout('pipe'),
  );

  const exitCode = yield* Command.exitCode(command).pipe(Effect.option);

  if (exitCode._tag === 'None') {
    return yield* new MutoolError({
      message:
        "mutool is not installed or not found in PATH. Please run 'devbox shell'",
    });
  }

  return true;
});

/**
 * 複数 PDF を画像に変換
 */
export const pdfToImages = (pdfPaths: string[], workspaceDir: string) =>
  Effect.gen(function* () {
    yield* hasMutool;

    yield* Effect.logInfo(`Converting ${pdfPaths.length} PDF(s) to images...`);

    const results = yield* Effect.forEach(
      pdfPaths,
      pdfPath => pdfToImagesOne(pdfPath, workspaceDir),
      { concurrency: 1 }, // mutool の負荷を考慮して順次実行
    );

    return results;
  });

/**
 * 1つの PDF を画像に変換
 */
const pdfToImagesOne = (pdfPath: string, workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    // 出力ディレクトリ名を決定（PDF ファイル名から拡張子を除いたもの）
    const pdfName = path.basename(pdfPath, '.pdf');
    const outDir = path.join(workspaceDir, pdfName);

    // 出力ディレクトリを作成
    yield* fs.makeDirectory(outDir, { recursive: true }).pipe(
      Effect.mapError(
        cause =>
          new MutoolError({
            message: `Failed to create output directory: ${outDir}`,
            cause,
          }),
      ),
    );

    // mutool convert 実行
    const outPattern = path.join(outDir, '%d.png');

    const command = Command.make(
      'mutool',
      'convert',
      '-F',
      'png',
      '-O',
      'resolution=600,gamma=1',
      '-o',
      outPattern,
      pdfPath,
    ).pipe(Command.stderr('inherit'), Command.stdout('inherit'));

    const exitCode = yield* Command.exitCode(command).pipe(
      Effect.mapError(
        cause =>
          new MutoolError({
            message: `Failed to run mutool convert for ${pdfPath}`,
            cause,
          }),
      ),
    );

    if (exitCode !== 0) {
      return yield* new MutoolError({
        message: `mutool convert failed with exit code ${exitCode} for ${pdfPath}`,
      });
    }

    yield* Effect.logInfo(`Converted: ${pdfPath} -> ${outDir}`);

    return outDir;
  });
