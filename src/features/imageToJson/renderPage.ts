import { Effect, Schema } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import type { Page, Project } from '../types.ts';

/**
 * Page オブジェクトを生成
 */
export const renderPage = (
  index: number,
  totalPages: number,
  gyazoImageId: string,
  ocrText: string,
): Page => {
  const padLength = String(totalPages).length;

  const title = String(index).padStart(padLength, '0');
  const prev = index === 0 ? index : index - 1;
  const next = index + 1;

  const prevStr = String(prev).padStart(padLength, '0');
  const nextStr = String(next).padStart(padLength, '0');

  const url = `https://gyazo.com/${gyazoImageId}`;

  const ocrLines = ocrText
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

  const content = `${title}
prev: [${prevStr}]
next: [${nextStr}]
[[${url}]]

${ocrLines}`;

  return {
    title,
    lines: content.split('\n'),
  };
};

/**
 * Cosense API からプロファイルページを取得
 */
export const createProfilePage = (cosenseProfilePage: string) =>
  Effect.gen(function* () {
    const pageDetail = yield* fetchPage(cosenseProfilePage);

    return {
      title: pageDetail.title,
      lines: pageDetail.lines.map(line => line.text),
    } satisfies Page;
  });

// Cosense API のレスポンス型
const PageDetail = Schema.Struct({
  title: Schema.String,
  lines: Schema.Array(
    Schema.Struct({
      text: Schema.String,
    }),
  ),
});

const fetchPage = (cosenseProfilePage: string) =>
  Effect.gen(function* () {
    const url = `https://scrapbox.io/api/pages/${cosenseProfilePage}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: cause =>
        new PdfToJsonError({
          message: `Failed to fetch profile page: ${cosenseProfilePage}`,
          cause,
        }),
    });

    if (!response.ok) {
      return yield* new PdfToJsonError({
        message: `Failed to fetch profile page: ${response.status} ${response.statusText}`,
      });
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause =>
        new PdfToJsonError({
          message: 'Failed to parse profile page response',
          cause,
        }),
    });

    return yield* Schema.decodeUnknown(PageDetail)(json).pipe(
      Effect.mapError(
        cause =>
          new PdfToJsonError({
            message: 'Invalid profile page response format',
            cause,
          }),
      ),
    );
  });

/**
 * Project を JSON ファイルに保存
 */
export const saveJson = (filePath: string, project: Project) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;

    const jsonStr = JSON.stringify(project, null, 2);

    yield* fs.writeFileString(filePath, jsonStr).pipe(
      Effect.mapError(
        cause =>
          new PdfToJsonError({
            message: `Failed to save JSON: ${filePath}`,
            cause,
          }),
      ),
    );
  });

class PdfToJsonError extends Schema.TaggedError<PdfToJsonError>()(
  'PdfToJsonError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
