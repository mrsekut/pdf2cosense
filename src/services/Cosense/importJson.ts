import { Effect, Schema } from 'effect';
import type { BrowserContext } from 'playwright';
import * as browser from '../browser/browser';

// GUI 経由でインポート
export const importJsonViaGui = (projectName: string, jsonPath: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `Importing to /${projectName} from ${jsonPath} (GUI)`,
    );

    const context = yield* browser.launch();

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
