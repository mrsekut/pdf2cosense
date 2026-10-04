import { Effect } from 'effect';
import { HttpClient } from 'effect/http';
import { IsbnNotFoundError, ApiError, type BookInfo } from './service.ts';

export const ndlSearchByTitle = (
  title: string,
): Effect.Effect<
  BookInfo,
  IsbnNotFoundError | ApiError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
    );
    const xml = yield* client
      .get('https://ndlsearch.ndl.go.jp/api/opensearch', {
        urlParams: { title, cnt: 5 },
      })
      .pipe(
        Effect.flatMap(response => response.text),
        Effect.mapError(e => new ApiError({ message: `NDL: ${e.message}` })),
      );

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
