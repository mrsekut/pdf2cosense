import { Effect, Schema, Context } from 'effect';

// 検索結果の型
export interface BookInfo {
  isbn: string;
  title: string;
  authors: readonly string[];
}

// Service定義
export class IsbnSearch extends Context.Tag('IsbnSearch')<
  IsbnSearch,
  {
    readonly searchByTitle: (
      title: string,
    ) => Effect.Effect<BookInfo, IsbnNotFoundError | ApiError>;
  }
>() {}

// エラー型
export class IsbnNotFoundError extends Schema.TaggedError<IsbnNotFoundError>()(
  'IsbnNotFoundError',
  { title: Schema.String },
) {}

export class ApiError extends Schema.TaggedError<ApiError>()('ApiError', {
  message: Schema.String,
}) {}
