import { Effect, Schema } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as browser from './browser';

const DEFAULT_AUTH_PATH = 'auth.json';

const AuthData = Schema.Struct({
  cookies: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
      domain: Schema.String,
    }),
  ),
});
type AuthData = typeof AuthData.Type;

// 認証情報を保存する
export const saveAuth = (authPath: string = DEFAULT_AUTH_PATH) =>
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

    yield* browser.saveStorageState(context, authPath);
    yield* browser.close(context);

    yield* Effect.logInfo(`Authentication saved to ${authPath}`);
  });

// auth.json が存在するか確認
export const exists = (path: string = DEFAULT_AUTH_PATH) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    return yield* fs.exists(path);
  }).pipe(
    Effect.mapError(
      cause => new AuthError({ message: 'Failed to check auth file', cause }),
    ),
  );

// auth.json を読み込む
export const load = (path: string = DEFAULT_AUTH_PATH) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const content = yield* fs.readFileString(path);
    return yield* Schema.decodeUnknown(Schema.parseJson(AuthData))(content);
  }).pipe(
    Effect.mapError(
      cause => new AuthError({ message: 'Failed to load auth', cause }),
    ),
  );

// connect.sid を取得
export const getSid = (path: string = DEFAULT_AUTH_PATH) =>
  Effect.gen(function* () {
    const auth = yield* load(path);
    const sidCookie = auth.cookies.find(
      c => c.name === 'connect.sid' && c.domain.includes('scrapbox.io'),
    );
    if (!sidCookie) {
      return yield* new AuthError({
        message: 'connect.sid not found in auth.json',
      });
    }
    return sidCookie.value;
  });

// 認証の有効性を検証
export const isValid = (sid: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch('https://scrapbox.io/api/users/me', {
        headers: { Cookie: `connect.sid=${sid}` },
      });
      return res.ok;
    },
    catch: cause =>
      new AuthError({ message: 'Failed to validate auth', cause }),
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
  saveAuth().pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
}
