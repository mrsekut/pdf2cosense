import { Effect, Layer } from 'effect';
import { BunContext } from '@effect/platform-bun';
import { pdfToJson, AppConfig, Gyazo } from './features/pdfToJson/index.ts';

const PdfToJsonLive = Layer.mergeAll(AppConfig.Default, Gyazo.Default);

export const runPdfToJson = pdfToJson.pipe(
  Effect.provide(PdfToJsonLive),
  Effect.provide(BunContext.layer),
);
