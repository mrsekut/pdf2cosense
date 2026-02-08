import { Effect, Schema } from 'effect';
import type { BrowserContext } from 'playwright';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import * as browser from '../browser/browser';

// プロジェクト作成
export const createProject = (isbn: string) =>
  Effect.gen(function* () {
    const projectName = `mrsekut-book-${isbn}`;
    yield* Effect.logInfo(`Creating project: ${projectName}`);

    const context = yield* browser.launch('auth.json');

    yield* Effect.tryPromise({
      try: () => fillAndSubmitForm(context, projectName),
      catch: cause =>
        new ProjectError({ message: 'Failed to create project', cause }),
    });

    yield* browser.close(context);

    const projectUrl = `https://scrapbox.io/${projectName}/`;
    yield* Effect.logInfo(`Project created: ${projectUrl}`);

    return projectName;
  });

const fillAndSubmitForm = async (
  context: BrowserContext,
  projectName: string,
) => {
  const page = context.pages()[0] || (await context.newPage());

  await page.goto('https://scrapbox.io/projects/new');
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: 'Project URL' }).fill(projectName);
  await page.getByRole('radio', { name: 'Private Project' }).click();
  await page.getByRole('radio', { name: /Personal/ }).click();
  await page.getByRole('radio', { name: 'gyazo.com' }).click();

  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`**/scrapbox.io/${projectName}/**`, { timeout: 10000 });
};

class ProjectError extends Schema.TaggedError<ProjectError>()('ProjectError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

// 直接実行時
if (import.meta.main) {
  const isbn = process.argv[2];
  if (!isbn) {
    console.error(
      'Usage: bun run src/features/createProject/project.ts <isbn>',
    );
    process.exit(1);
  }

  createProject(isbn).pipe(
    Effect.provide(BunContext.layer),
    BunRuntime.runMain,
  );
}
