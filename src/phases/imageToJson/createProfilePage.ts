import { Effect, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import type { Page } from '../../services/Cosense/types.ts';

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
    // 2xx 以外のステータスもエラーとして扱う
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
    );
    const response = yield* client.get(
      `https://scrapbox.io/api/pages/${cosenseProfilePage}`,
    );
    return yield* HttpClientResponse.schemaBodyJson(PageDetail)(response);
  }).pipe(
    Effect.mapError(
      cause =>
        new CreateProfileError({
          message: `Failed to fetch profile page: ${cosenseProfilePage}`,
          cause,
        }),
    ),
  );

class CreateProfileError extends Schema.TaggedError<CreateProfileError>()(
  'CreateProfileError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
