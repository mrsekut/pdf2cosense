import { Effect, Schema, Layer } from 'effect';
import {
  IsbnSearch,
  IsbnNotFoundError,
  ApiError,
  type BookInfo,
} from './service.ts';

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
): Effect.Effect<BookInfo, IsbnNotFoundError | ApiError> =>
  Effect.gen(function* () {
    const query = encodeURIComponent(title);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: () => new ApiError({ message: 'Failed to fetch' }),
    });

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => new ApiError({ message: 'Failed to parse JSON' }),
    });

    const errorResult = Schema.decodeUnknownOption(GoogleBooksErrorResponse)(
      json,
    );
    if (errorResult._tag === 'Some') {
      return yield* new ApiError({ message: errorResult.value.error.message });
    }

    const data = yield* Schema.decodeUnknown(GoogleBooksResponse)(json).pipe(
      Effect.mapError(() => new ApiError({ message: 'Invalid response' })),
    );

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

export const GoogleBooksLayer = Layer.succeed(IsbnSearch, {
  searchByTitle: googleBooksSearchByTitle,
});
