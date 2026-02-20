import { Effect, Layer } from 'effect';
import {
  IsbnSearch,
  IsbnNotFoundError,
  ApiError,
  type BookInfo,
} from './service.ts';

export const ndlSearchByTitle = (
  title: string,
): Effect.Effect<BookInfo, IsbnNotFoundError | ApiError> =>
  Effect.gen(function* () {
    const query = encodeURIComponent(title);
    const url = `https://ndlsearch.ndl.go.jp/api/opensearch?title=${query}&cnt=5`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: () => new ApiError({ message: 'Failed to fetch' }),
    });

    const xml = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => new ApiError({ message: 'Failed to read response' }),
    });

    // XMLからISBNを抽出 (簡易パース)
    // ISBN形式: 978-4-297-12914-9 or 4297129149
    const isbnMatch = xml.match(
      /<dc:identifier[^>]*dcndl:ISBN[^>]*>([\d-]+)<\/dc:identifier>/,
    );
    if (!isbnMatch || !isbnMatch[1]) {
      return yield* new IsbnNotFoundError({ title });
    }

    // ハイフンを除去
    const isbn = isbnMatch[1].replace(/-/g, '');

    const titleMatch = xml.match(/<dc:title>([^<]+)<\/dc:title>/);
    const authorMatch = xml.match(/<dc:creator>([^<]+)<\/dc:creator>/);

    return {
      isbn,
      title: titleMatch?.[1] ?? title,
      authors: authorMatch?.[1] ? [authorMatch[1]] : [],
    };
  });

export const NdlLayer = Layer.succeed(IsbnSearch, {
  searchByTitle: ndlSearchByTitle,
});
