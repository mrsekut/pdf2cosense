import { Effect, Layer } from 'effect';
import { BunContext } from '@effect/platform-bun';
import { pdfToJson, AppConfig } from './features/pdfToJson/index.ts';
import { Gyazo } from './features/Gyazo/index.ts';

const PdfToJsonLive = Layer.mergeAll(AppConfig.Default, Gyazo.Default);

export const runPdfToJson = pdfToJson.pipe(
  Effect.provide(PdfToJsonLive),
  Effect.provide(BunContext.layer),
);
