import { Effect, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { IsbnNotFoundError, ApiError, type BookInfo } from './service.ts';

const GoogleBooksResponse = Schema.Struct({
  totalItems: Schema.Number,
  items: Schema.optional(
    Schema.Array(
      Schema.Struct({
        volumeInfo: Schema.Struct({
          title: Schema.String,
          authors: Schema.optional(Schema.Array(Schema.String)),
          industryIdentifiers: Schema.optional(
            Schema.Array(
              Schema.Struct({
                type: Schema.String,
                identifier: Schema.String,
              }),
            ),
          ),
        }),
      }),
    ),
  ),
});

const GoogleBooksErrorResponse = Schema.Struct({
  error: Schema.Struct({
    code: Schema.Number,
    message: Schema.String,
  }),
});

export const googleBooksSearchByTitle = (
  title: string,
): Effect.Effect<
  BookInfo,
  IsbnNotFoundError | ApiError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client
      .get('https://www.googleapis.com/books/v1/volumes', {
        urlParams: { q: title, maxResults: 5 },
      })
      .pipe(
        Effect.mapError(
          e => new ApiError({ message: `Google Books: ${e.message}` }),
        ),
      );

    // 2xx は検索結果、それ以外は Google のエラー本文からメッセージを取り出す
    const data = yield* HttpClientResponse.matchStatus(response, {
      '2xx': r =>
        HttpClientResponse.schemaBodyJson(GoogleBooksResponse)(r).pipe(
          Effect.mapError(() => new ApiError({ message: 'Invalid response' })),
        ),
      orElse: r =>
        HttpClientResponse.schemaBodyJson(GoogleBooksErrorResponse)(r).pipe(
          Effect.matchEffect({
            onSuccess: body =>
              Effect.fail(new ApiError({ message: body.error.message })),
            onFailure: () =>
              Effect.fail(new ApiError({ message: `HTTP ${r.status}` })),
          }),
        ),
    });

    if (!data.items || data.items.length === 0) {
      return yield* new IsbnNotFoundError({ title });
    }

    for (const item of data.items) {
      const identifiers = item.volumeInfo.industryIdentifiers;
      if (!identifiers) continue;

      const isbn10 = identifiers.find(id => id.type === 'ISBN_10');
      if (isbn10) {
        return {
          isbn: isbn10.identifier,
          title: item.volumeInfo.title,
          authors: item.volumeInfo.authors ?? [],
        };
      }

      const isbn13 = identifiers.find(id => id.type === 'ISBN_13');
      if (isbn13) {
        return {
          isbn: isbn13.identifier,
          title: item.volumeInfo.title,
          authors: item.volumeInfo.authors ?? [],
        };
      }
    }

    return yield* new IsbnNotFoundError({ title });
  });
