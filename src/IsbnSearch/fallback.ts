import { Effect, Layer, Console } from 'effect';
import * as Readline from 'node:readline';
import { IsbnSearch, IsbnNotFoundError, type BookInfo } from './service.ts';
import { ndlSearchByTitle } from './ndl.ts';
import { googleBooksSearchByTitle } from './googleBooks.ts';

// ユーザーにISBNを入力させる
const promptIsbn = (title: string): Effect.Effect<string | null> =>
  Effect.async<string | null>(resume => {
    const rl = Readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    Console.log(
      `\nISBN not found for "${title}". Please enter ISBN manually (or press Enter to skip):`,
    ).pipe(Effect.runSync);

    rl.question('ISBN: ', answer => {
      rl.close();
      const trimmed = answer.trim();
      resume(Effect.succeed(trimmed === '' ? null : trimmed));
    });
  });

const searchWithFallback = (
  title: string,
): Effect.Effect<BookInfo, IsbnNotFoundError> =>
  Effect.gen(function* () {
    // 1. NDLで検索
    yield* Effect.logDebug(`Trying NDL for: ${title}`);
    const ndlResult = yield* ndlSearchByTitle(title).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (ndlResult) {
      yield* Effect.logDebug('Found via NDL');
      return ndlResult;
    }

    // 2. Google Booksで検索
    yield* Effect.logDebug(`Trying Google Books for: ${title}`);
    const googleResult = yield* googleBooksSearchByTitle(title).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (googleResult) {
      yield* Effect.logDebug('Found via Google Books');
      return googleResult;
    }

    // 3. ユーザーに入力を求める
    const userIsbn = yield* promptIsbn(title);
    if (userIsbn) {
      return {
        isbn: userIsbn.replace(/-/g, ''),
        title,
        authors: [],
      };
    }

    return yield* new IsbnNotFoundError({ title });
  });

export const FallbackIsbnSearchLayer = Layer.succeed(IsbnSearch, {
  searchByTitle: searchWithFallback,
});
