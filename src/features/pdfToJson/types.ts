import { Schema } from 'effect';

// ===== Domain Types =====

export type Page = {
  title: string;
  lines: string[];
};

export type Project = {
  pages: Page[];
};

// ===== Error Types =====

export class PdfToJsonError extends Schema.TaggedError<PdfToJsonError>()(
  'PdfToJsonError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
