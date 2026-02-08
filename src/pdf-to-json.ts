import { Effect, Layer } from 'effect';
import { BunContext } from '@effect/platform-bun';
import { Gyazo } from './features/Gyazo/index.ts';
import { pdfToJson } from './features/pdfToJson/pdfToJson.ts';
import { AppConfig } from './features/pdfToJson/services/AppConfig.ts';

const PdfToJsonLive = Layer.mergeAll(AppConfig.Default, Gyazo.Default);

export const runPdfToJson = pdfToJson.pipe(
  Effect.provide(PdfToJsonLive),
  Effect.provide(BunContext.layer),
);
