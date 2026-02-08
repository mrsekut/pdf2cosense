import { Effect, Schema } from 'effect';
import { Command } from '@effect/platform';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

const WORKSPACE_DIR = './workspace';
const PDF_TO_JSON_DIR = './pdf-to-json';

export const runPdfToJson = Effect.gen(function* () {
  yield* Effect.logInfo('Running pdf-to-json (Rust)...');

  const command = Command.make('cargo', 'run').pipe(
    Command.workingDirectory(PDF_TO_JSON_DIR),
    Command.stdout('inherit'),
    Command.stderr('inherit'),
  );

  const exitCode = yield* Command.exitCode(command).pipe(
    Effect.mapError(cause =>
      Effect.fail(
        new PdfToJsonError({ message: 'Failed to run cargo', cause }),
      ),
    ),
  );

  if (exitCode !== 0) {
    return yield* new PdfToJsonError({
      message: `cargo run failed with exit code ${exitCode}`,
    });
  }

  yield* Effect.logInfo('pdf-to-json completed');

  return yield* findJsonFiles;
});

const findJsonFiles = Effect.gen(function* () {
  const fs = yield* Fs.FileSystem;
  const path = yield* Path.Path;

  const files = yield* fs.readDirectory(WORKSPACE_DIR);

  const jsonFiles = files
    .filter(f => f.endsWith('-ocr.json'))
    .map(f => path.resolve(WORKSPACE_DIR, f));

  return jsonFiles;
});

class PdfToJsonError extends Schema.TaggedError<PdfToJsonError>()(
  'PdfToJsonError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
