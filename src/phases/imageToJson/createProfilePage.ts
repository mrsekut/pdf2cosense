import { Effect, Schema } from 'effect';
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
    const url = `https://scrapbox.io/api/pages/${cosenseProfilePage}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: cause =>
        new CreateProfileError({
          message: `Failed to fetch profile page: ${cosenseProfilePage}`,
          cause,
        }),
    });

    if (!response.ok) {
      return yield* new CreateProfileError({
        message: `Failed to fetch profile page: ${response.status} ${response.statusText}`,
      });
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause =>
        new CreateProfileError({
          message: 'Failed to parse profile page response',
          cause,
        }),
    });

    return yield* Schema.decodeUnknown(PageDetail)(json).pipe(
      Effect.mapError(
        cause =>
          new CreateProfileError({
            message: 'Invalid profile page response format',
            cause,
          }),
      ),
    );
  });

class CreateProfileError extends Schema.TaggedError<CreateProfileError>()(
  'CreateProfileError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
