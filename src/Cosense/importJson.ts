import { Effect, Schema, Array, Duration } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import type { BrowserContext } from 'playwright';
import * as browser from '../browser/browser';
import { CosenseJson, Page } from './types';

const BATCH_SIZE = 100;

// JSON ファイルからインポート
export const importJsonViaApi = (
  projectName: string,
  jsonPath: string,
  sid: string,
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Importing to /${projectName} from ${jsonPath}`);

    // JSON 読み込み
    const fs = yield* Fs.FileSystem;
    const content = yield* fs.readFileString(jsonPath);
    const data = yield* Schema.decodeUnknown(Schema.parseJson(CosenseJson))(
      content,
    );

    yield* Effect.logInfo(`Found ${data.pages.length} pages`);

    // バッチ処理でインポート
    yield* importPagesBatched(projectName, data.pages, sid);

    yield* Effect.logInfo(`Import completed: ${data.pages.length} pages`);
  });

// バッチ処理でインポート
const importPagesBatched = (
  projectName: string,
  pages: readonly Page[],
  sid: string,
) =>
  Effect.gen(function* () {
    const chunks = Array.chunksOf(pages, BATCH_SIZE);

    yield* Effect.forEach(
      chunks,
      (batch, i) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(
            `Batch ${i + 1}/${chunks.length} (${batch.length} pages)`,
          );
          yield* importPages(projectName, batch, sid);

          if (i < chunks.length - 1) {
            yield* Effect.sleep(Duration.seconds(1));
          }
        }),
      { concurrency: 1 },
    );
  });

// ページをインポート
const importPages = (projectName: string, pages: Page[], sid: string) =>
  Effect.tryPromise({
    try: async () => {
      // CSRF トークン取得
      const csrfRes = await fetch('https://scrapbox.io/api/users/me', {
        headers: { Cookie: `connect.sid=${sid}` },
      });
      const csrfJson = (await csrfRes.json()) as { csrfToken: string };

      // FormData 作成
      const formData = new FormData();
      const file = new File([JSON.stringify({ pages })], 'import.json', {
        type: 'application/octet-stream',
      });
      formData.append('import-file', file);
      formData.append('name', 'import.json');

      // インポート実行
      const res = await fetch(
        `https://scrapbox.io/api/page-data/import/${projectName}.json`,
        {
          method: 'POST',
          headers: {
            Cookie: `connect.sid=${sid}`,
            Accept: 'application/json, text/plain, */*',
            'X-CSRF-TOKEN': csrfJson.csrfToken,
          },
          body: formData,
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${body}`);
      }

      return (await res.json()) as { message: string };
    },
    catch: cause =>
      new ImportError({ message: 'Failed to import pages', cause }),
  });

// GUI 経由でインポート
export const importJsonViaGui = (projectName: string, jsonPath: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `Importing to /${projectName} from ${jsonPath} (GUI)`,
    );

    const context = yield* browser.launch('auth.json');

    yield* Effect.tryPromise({
      try: () => uploadViaGui(context, projectName, jsonPath),
      catch: cause =>
        new ImportError({ message: 'Failed to import via GUI', cause }),
    });

    yield* browser.close(context);

    yield* Effect.logInfo(`Import completed via GUI`);
  });

const uploadViaGui = async (
  context: BrowserContext,
  projectName: string,
  jsonPath: string,
) => {
  const page = context.pages()[0] || (await context.newPage());

  // 設定ページへ移動
  await page.goto(
    `https://scrapbox.io/projects/${projectName}/settings/page-data`,
  );
  await page.waitForLoadState('networkidle');

  // ファイル選択ダイアログを処理
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose File' }).click();
  const fileChooser = await fileChooserPromise;

  // 絶対パスに変換してファイルをセット
  const absolutePath = jsonPath.startsWith('/')
    ? jsonPath
    : `${process.cwd()}/${jsonPath}`;
  await fileChooser.setFiles(absolutePath);

  // Import Pages ボタンをクリック
  await page.getByRole('button', { name: 'Import Pages' }).click();

  // 完了を待つ: プロジェクトトップページに遷移するまで待機
  await page.waitForURL(`https://scrapbox.io/${projectName}/`, {
    timeout: 60000, // 最大1分待機
  });
};

class ImportError extends Schema.TaggedError<ImportError>()('ImportError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
