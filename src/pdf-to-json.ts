import { Effect, Console } from "effect";
import { Command } from "@effect/platform";
import * as Fs from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";

const WORKSPACE_DIR = "./workspace";
const PDF_TO_JSON_DIR = "./pdf-to-json";

export class PdfToJsonError extends Error {
  readonly _tag = "PdfToJsonError";
  constructor(message: string) {
    super(message);
    this.name = "PdfToJsonError";
  }
}

export const runPdfToJson = Effect.gen(function* () {
  yield* Console.log("📄 Running pdf-to-json (Rust)...");

  const command = Command.make("cargo", "run").pipe(
    Command.workingDirectory(PDF_TO_JSON_DIR),
    Command.stdout("inherit"),
    Command.stderr("inherit"),
  );

  const exitCode = yield* Command.exitCode(command).pipe(
    Effect.catchAll((error) =>
      Effect.fail(new PdfToJsonError(`Failed to run cargo: ${error}`)),
    ),
  );

  if (exitCode !== 0) {
    return yield* Effect.fail(
      new PdfToJsonError(`cargo run failed with exit code ${exitCode}`),
    );
  }

  yield* Console.log("✅ pdf-to-json completed");

  return yield* findJsonFiles;
});

export const findJsonFiles = Effect.gen(function* () {
  const fs = yield* Fs.FileSystem;
  const path = yield* Path.Path;

  const files = yield* fs.readDirectory(WORKSPACE_DIR);

  const jsonFiles = files
    .filter((f) => f.endsWith("-ocr.json"))
    .map((f) => path.resolve(WORKSPACE_DIR, f));

  return jsonFiles;
});
