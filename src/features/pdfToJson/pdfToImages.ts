import { Effect, Schema } from 'effect';
import { Command } from '@effect/platform';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

/**
 * 複数 PDF を画像に変換
 */
export const pdfToImages = (pdfPaths: string[], workspaceDir: string) =>
  Effect.gen(function* () {
    const exist = yield* hasMutool;
    if (!exist) {
      return yield* new MutoolError({
        message:
          'mutool is not installed or not found in PATH. Please run `devbox shell`',
      });
    }

    yield* Effect.logInfo(`Converting ${pdfPaths.length} PDF(s) to images...`);

    const results = yield* Effect.forEach(pdfPaths, pdfPath =>
      pdfToImagesOne(pdfPath, workspaceDir),
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
    yield* fs.makeDirectory(outDir, { recursive: true });

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

    const exitCode = yield* Command.exitCode(command);

    if (exitCode !== 0) {
      return yield* new MutoolError({
        message: `mutool convert failed with exit code ${exitCode} for ${pdfPath}`,
      });
    }

    yield* Effect.logInfo(`Converted: ${pdfPath} -> ${outDir}`);

    return outDir;
  });

/**
 * mutool コマンドの存在確認
 */
export const hasMutool = Effect.sync(() => Bun.which('mutool') !== null);

class MutoolError extends Schema.TaggedError<MutoolError>()('MutoolError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
