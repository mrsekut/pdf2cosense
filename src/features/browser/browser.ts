import { Effect, Schema } from 'effect';
import { chromium, type BrowserContext } from 'playwright';

const DEFAULT_PROFILE_DIR = './browser-profile';

// ブラウザ起動
export const launch = () =>
  Effect.tryPromise({
    try: async () => {
      return await chromium.launchPersistentContext(DEFAULT_PROFILE_DIR, {
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
      });
    },
    catch: cause =>
      new BrowserError({ message: 'Failed to launch browser', cause }),
  });

// ブラウザ終了
export const close = (context: BrowserContext) =>
  Effect.tryPromise({
    try: () => context.close(),
    catch: cause =>
      new BrowserError({ message: 'Failed to close browser', cause }),
  });

// 認証情報保存
export const saveStorageState = (context: BrowserContext, path: string) =>
  Effect.tryPromise({
    try: () => context.storageState({ path }),
    catch: cause =>
      new BrowserError({ message: 'Failed to save storage state', cause }),
  });

class BrowserError extends Schema.TaggedError<BrowserError>()('BrowserError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
