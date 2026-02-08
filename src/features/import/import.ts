import { Effect, Schema, Array as A, Duration } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import type { BrowserContext } from 'playwright';
import * as auth from '../browser/auth';
import * as browser from '../browser/browser';

const BATCH_SIZE = 100;

// ページ型
const CosensePage = Schema.Struct({
  title: Schema.String,
  lines: Schema.Array(Schema.String),
});

const CosenseJson = Schema.Struct({
  pages: Schema.Array(CosensePage),
});

type CosensePage = typeof CosensePage.Type;

// JSON ファイルからインポート
export const importFromFile = (projectName: string, jsonPath: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Importing to /${projectName} from ${jsonPath}`);

    // JSON 読み込み
    const fs = yield* Fs.FileSystem;
    const content = yield* fs.readFileString(jsonPath);
    const data = yield* Schema.decodeUnknown(Schema.parseJson(CosenseJson))(
      content,
    );

    yield* Effect.logInfo(`Found ${data.pages.length} pages`);

    // 認証情報取得
    const sid = yield* auth.getSid();

    // バッチ処理でインポート
    yield* importPagesBatched(projectName, data.pages, sid);

    yield* Effect.logInfo(`Import completed: ${data.pages.length} pages`);
  });

// バッチ処理でインポート
const importPagesBatched = (
  projectName: string,
  pages: readonly CosensePage[],
  sid: string,
) =>
  Effect.gen(function* () {
    const chunks = A.chunksOf(pages, BATCH_SIZE);

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
const importPages = (projectName: string, pages: CosensePage[], sid: string) =>
  Effect.tryPromise({
    try: () => rawImportPages(projectName, pages, sid),
    catch: cause =>
      new ImportError({ message: 'Failed to import pages', cause }),
  });

// 実際の API 呼び出し
const rawImportPages = async (
  projectName: string,
  pages: CosensePage[],
  sid: string,
) => {
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
};

// GUI 経由でインポート（429 回避用）
export const importViaGui = (projectName: string, jsonPath: string) =>
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

  // 完了を待つ（ボタンが再度 disabled になるか、成功メッセージを待つ）
  await page.waitForTimeout(3000);
};

class ImportError extends Schema.TaggedError<ImportError>()('ImportError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

// 直接実行時
if (import.meta.main) {
  const projectName = process.argv[2];
  const jsonPath = process.argv[3];

  if (!projectName || !jsonPath) {
    console.error(
      'Usage: bun run src/features/import/import.ts <projectName> <jsonPath>',
    );
    process.exit(1);
  }

  // GUI ベースでインポート（429 回避）
  importViaGui(projectName, jsonPath).pipe(
    Effect.provide(BunContext.layer),
    BunRuntime.runMain,
  );
}
