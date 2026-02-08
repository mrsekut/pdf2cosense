import { Schema } from 'effect';

// ===== Domain Types =====

export interface Page {
  title: string;
  lines: string[];
}

export interface Project {
  pages: Page[];
}

// ===== Error Types =====

export class PdfToJsonError extends Schema.TaggedError<PdfToJsonError>()(
  'PdfToJsonError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class GyazoError extends Schema.TaggedError<GyazoError>()('GyazoError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class MutoolError extends Schema.TaggedError<MutoolError>()(
  'MutoolError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
