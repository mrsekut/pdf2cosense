import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import { Terminal } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { runPdfToJson } from './pdf-to-json.ts';
import { createProject } from './features/createProject/index.ts';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;

    // 1. JSON 生成（Rust）
    const jsonFiles = yield* runPdfToJson;
    yield* Effect.logInfo(`Generated ${jsonFiles.length} JSON file(s)`);

    // 2. 各 JSON に対してプロジェクト作成
    yield* Effect.forEach(
      jsonFiles,
      jsonFile =>
        Effect.gen(function* () {
          const fileName = yield* getFileName(jsonFile);
          const pageCount = yield* getPageCount(jsonFile);

          yield* Effect.logInfo(`Processing: ${fileName} (${pageCount} pages)`);

          // ISBN を問い合わせ
          yield* terminal.display(`Enter ISBN for ${fileName}: `);
          const isbn = yield* terminal.readLine;

          if (!isbn.trim()) {
            yield* Effect.logWarning('Skipped (no ISBN provided)');
            return;
          }

          // プロジェクト作成
          yield* createProject(isbn.trim());

          // TODO: 3. インポート（Phase 3 で実装）
        }),
      { discard: true },
    );

    yield* Effect.logInfo('All done!');
  }),
);

const getFileName = (filePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.basename(filePath);
  });

// TODO: move
const CosenseJson = Schema.Struct({
  pages: Schema.Array(Schema.Struct({ title: Schema.String })),
});

// TODO: move
const getPageCount = (jsonPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const content = yield* fs.readFileString(jsonPath);
    const data = yield* Schema.decodeUnknown(Schema.parseJson(CosenseJson))(
      content,
    );
    return data.pages.length;
  }).pipe(Effect.orElseSucceed(() => 0));

// CLI entry point
const cli = Command.run(mainCommand, {
  name: 'pdf2cosense',
  version: '0.1.0',
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
