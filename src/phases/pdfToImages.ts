import { Effect, Schema, FileSystem as Fs, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/**
 * PDF を画像に変換
 */
export const pdfToImages = (pdfPath: string) =>
  Effect.gen(function* () {
    const exist = yield* hasMutool;
    if (!exist) {
      return yield* new MutoolError({
        message:
          'mutool is not installed or not found in PATH. Please run `devbox shell`',
      });
    }

    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    // 出力ディレクトリ名を決定（PDF と同じディレクトリに、PDF名のフォルダを作成）
    const pdfDir = path.dirname(pdfPath);
    const pdfName = path.basename(pdfPath, '.pdf');
    const outDir = path.join(pdfDir, pdfName);

    // 出力ディレクトリを作成
    yield* fs.makeDirectory(outDir, { recursive: true });

    yield* Effect.logInfo(`Converting PDF to images: ${pdfPath}`);

    // mutool convert 実行
    const outPattern = path.join(outDir, '%d.png');

    const command = ChildProcess.make(
      'mutool',
      [
        'convert',
        '-F',
        'png',
        '-O',
        'resolution=600,gamma=1',
        '-o',
        outPattern,
        pdfPath,
      ],
      { stdout: 'inherit', stderr: 'inherit' },
    );

    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(command);

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
