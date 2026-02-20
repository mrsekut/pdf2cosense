import { Effect, Schema } from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as browser from './browser';

// ブラウザでログイン（認証情報はブラウザプロファイルに保存される）
export const login = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Launching browser for authentication...');

    const context = yield* browser.launch();
    const page =
      context.pages()[0] ||
      (yield* Effect.tryPromise({
        try: () => context.newPage(),
        catch: cause =>
          new AuthError({ message: 'Failed to create page', cause }),
      }));

    yield* Effect.tryPromise({
      try: () => page.goto('https://scrapbox.io/login/google'),
      catch: cause =>
        new AuthError({ message: 'Failed to navigate to Scrapbox', cause }),
    });

    yield* Effect.logInfo('Please login to Scrapbox, then press Enter...');
    yield* waitForEnter;

    yield* browser.close(context);

    yield* Effect.logInfo(
      'Authentication completed. Session saved to browser profile.',
    );
  });

// ヘルパー: Enter キー待機
const waitForEnter = Effect.async<void>(resume => {
  process.stdin.once('data', () => {
    process.stdin.pause();
    resume(Effect.void);
  });
});

class AuthError extends Schema.TaggedError<AuthError>()('AuthError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

// 直接実行時
if (import.meta.main) {
  login().pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
}
