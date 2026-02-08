import { Command, Options } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Console, Effect } from 'effect';
import { runPdfToJson } from './pdf-to-json.ts';

// Options
const jsonOnly = Options.boolean('json-only').pipe(
  Options.withDescription('Only generate JSON, skip upload'),
  Options.withDefault(false),
);

// Main command
const mainCommand = Command.make('pdf2cosense', { jsonOnly }, args =>
  Effect.gen(function* () {
    const { jsonOnly } = args;

    const jsonFiles = yield* runPdfToJson;
    yield* Console.log(`✅ Generated ${jsonFiles.length} JSON file(s)`);

    if (jsonOnly) {
      yield* Console.log('Done (--json-only mode)');
      return;
    }

    yield* Console.log('✅ All done!');
  }),
);

// CLI entry point
const cli = Command.run(mainCommand, {
  name: 'pdf2cosense',
  version: '0.1.0',
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
