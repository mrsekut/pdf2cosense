import { Command } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Effect } from 'effect';
import { runPdfToJson } from './pdf-to-json.ts';

// Main command
const mainCommand = Command.make('pdf2cosense', {}, () =>
  Effect.gen(function* () {
    // 1. JSON 生成（Rust）
    const jsonFiles = yield* runPdfToJson;
    yield* Effect.logInfo(`Generated ${jsonFiles.length} JSON file(s)`);

    // TODO: 2. 各 JSON に対してプロジェクト作成 & インポート

    yield* Effect.logInfo('All done!');
  }),
);

// CLI entry point
const cli = Command.run(mainCommand, {
  name: 'pdf2cosense',
  version: '0.1.0',
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
