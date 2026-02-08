import { Effect, Option } from 'effect';
import { AppConfig } from './services/index.ts';
import { getPdfPaths, getImageDirs, getImages } from './files.ts';
import { pdfToImages } from './pdfToImages.ts';
import { generatePage } from './generatePage.ts';
import { createProfilePage, saveJson } from './renderPage.ts';
import type { Page, Project } from './types.ts';

/**
 * メイン処理: PDF → 画像 → Gyazo → OCR → JSON
 */
export const pdfToJson = Effect.gen(function* () {
  const config = yield* AppConfig;

  yield* Effect.logInfo('Starting pdf-to-json...');

  // 1. PDF ファイル一覧を取得
  const pdfPaths = yield* getPdfPaths(config.workspaceDir);
  yield* Effect.logInfo(`Found ${pdfPaths.length} PDF file(s)`);

  if (pdfPaths.length === 0) {
    yield* Effect.logInfo('No PDF files found. Skipping conversion.');
  } else {
    // 2. PDF → 画像変換
    yield* pdfToImages(pdfPaths, config.workspaceDir);
    yield* Effect.logInfo('PDF to images conversion completed');
  }

  // 3. 画像ディレクトリ一覧を取得
  const imageDirs = yield* getImageDirs(config.workspaceDir);
  yield* Effect.logInfo(`Found ${imageDirs.length} image directory(s)`);

  // 4. 各ディレクトリを処理して JSON 生成
  const jsonFiles: string[] = [];

  for (const dir of imageDirs) {
    const jsonPath = yield* dirToCosense(dir, config.profile);
    jsonFiles.push(jsonPath);
  }

  yield* Effect.logInfo(`Generated ${jsonFiles.length} JSON file(s)`);

  return jsonFiles;
});

/**
 * 1つのディレクトリを処理して JSON を生成
 */
const dirToCosense = (dirPath: string, profile: Option.Option<string>) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Processing directory: ${dirPath}`);

    // 画像一覧を取得
    const images = yield* getImages(dirPath);
    const totalPages = images.length;

    yield* Effect.logInfo(`Found ${totalPages} image(s)`);

    // 並行でページ生成
    const pages = yield* processImagesConcurrently(images, totalPages);

    yield* Effect.logInfo(`Generated ${pages.length} page(s)`);

    // プロファイルページを追加
    const pagesWithProfile = yield* addProfilePageIfNeeded(pages, profile);

    // JSON 保存
    const jsonPath = `${dirPath}-ocr.json`;
    const project: Project = { pages: pagesWithProfile };
    yield* saveJson(jsonPath, project);

    yield* Effect.logInfo(`Saved JSON to ${jsonPath}`);

    return jsonPath;
  });

/**
 * 画像を並行処理してページを生成
 */
const processImagesConcurrently = (images: string[], totalPages: number) =>
  Effect.forEach(
    images.map((image, index) => ({ image, index })),
    ({ image, index }) =>
      generatePage(index, image, totalPages).pipe(
        Effect.tap(() =>
          Effect.logDebug(`Processed page ${index + 1}/${totalPages}`),
        ),
        Effect.option, // 失敗しても None として継続
      ),
    { concurrency: 50 },
  ).pipe(
    Effect.map(results =>
      results
        .filter((r): r is Option.Some<Page> => Option.isSome(r))
        .map(r => r.value),
    ),
  );

/**
 * プロファイルページを先頭に追加
 */
const addProfilePageIfNeeded = (
  pages: Page[],
  profile: Option.Option<string>,
) =>
  Effect.gen(function* () {
    if (Option.isNone(profile)) {
      return pages;
    }

    const profilePage = yield* createProfilePage(profile.value).pipe(
      Effect.option,
    );

    if (Option.isNone(profilePage)) {
      yield* Effect.logWarning('Failed to fetch profile page, skipping');
      return pages;
    }

    return [profilePage.value, ...pages];
  });
