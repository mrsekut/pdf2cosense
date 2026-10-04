import {
  Duration,
  Effect,
  pipe,
  Array,
  Order,
  FileSystem as Fs,
  Path,
} from 'effect';
import { AppConfig } from '../../config/AppConfig.ts';
import { uploadImage, fetchOcrText } from './generatePage.ts';
import { renderPage, saveJson } from './renderPage.ts';
import { createProfilePage } from './createProfilePage.ts';
import type { Project } from '../../services/Cosense/types.ts';

const BATCH_SIZE = 50;
const UPLOAD_CONCURRENCY = 10;
const PROGRESS_FILE = '.gyazo.json';

/** 画像ファイル名 -> アップロード結果。途中失敗からの再開に使う */
type Progress = Record<string, { imageId: string; ocrText?: string }>;

/**
 * 画像ディレクトリから JSON を生成
 * バッチ処理: BATCH_SIZE 枚ずつ upload → 10s wait → OCR fetch
 * バッチごとに進捗を保存し、再実行時は処理済みの画像をスキップする
 */
export const imagesToJson = (imageDir: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const path = yield* Path.Path;

    yield* Effect.logInfo(`Processing images in: ${imageDir}`);

    const images = yield* getImages(imageDir);
    yield* Effect.logInfo(`Found ${images.length} image(s)`);

    const progressPath = path.join(imageDir, PROGRESS_FILE);
    const progress = yield* loadProgress(progressPath);
    const doneCount = images.filter(
      image => progress[path.basename(image)]?.ocrText !== undefined,
    ).length;
    if (doneCount > 0) {
      yield* Effect.logInfo(
        `Resuming: ${doneCount}/${images.length} image(s) already processed`,
      );
    }

    const imageChunks = Array.chunksOf(images, BATCH_SIZE);

    for (const [chunkIndex, chunk] of imageChunks.entries()) {
      const offset = chunkIndex * BATCH_SIZE;
      const entries = chunk.map((image, index) => ({
        image,
        index: offset + index,
        key: path.basename(image),
      }));

      // Upload batch（未アップロードのもののみ）
      const toUpload = entries.filter(e => progress[e.key] === undefined);
      if (toUpload.length > 0) {
        yield* Effect.logInfo(
          `Batch ${chunkIndex + 1}/${imageChunks.length}: Uploading ${toUpload.length} image(s)...`,
        );
        yield* Effect.forEach(
          toUpload,
          e =>
            uploadImage(e.index, e.image, images.length).pipe(
              Effect.tap(imageId =>
                Effect.sync(() => {
                  progress[e.key] = { imageId };
                }),
              ),
            ),
          { concurrency: UPLOAD_CONCURRENCY },
        ).pipe(Effect.ensuring(saveProgress(progressPath, progress)));

        // Wait for OCR processing
        yield* Effect.logInfo('Waiting 10s for OCR processing...');
        yield* Effect.sleep(Duration.seconds(10));
      }

      // OCR fetch batch（未取得のもののみ）
      const toFetch = entries.filter(
        e => progress[e.key]?.ocrText === undefined,
      );
      if (toFetch.length > 0) {
        yield* Effect.logInfo(
          `Batch ${chunkIndex + 1}/${imageChunks.length}: Fetching OCR texts...`,
        );
        yield* Effect.forEach(
          toFetch,
          e => {
            const entry = progress[e.key]!;
            return fetchOcrText(e.index, entry.imageId, images.length).pipe(
              Effect.tap(ocrText =>
                Effect.sync(() => {
                  entry.ocrText = ocrText;
                }),
              ),
            );
          },
          { concurrency: 'unbounded' },
        );
        yield* saveProgress(progressPath, progress);
      }
    }

    const allImageIds = images.map(
      image => progress[path.basename(image)]!.imageId,
    );
    const allOcrTexts = images.map(
      image => progress[path.basename(image)]!.ocrText ?? '',
    );

    // Render pages
    const pages = allImageIds.map((imageId, index) =>
      renderPage(index, images.length, imageId, allOcrTexts[index] ?? ''),
    );

    yield* Effect.logInfo(`Generated ${pages.length} page(s)`);

    // プロファイルページを追加（設定されている場合のみ）
    const pagesWithProfile = config.profile
      ? [yield* createProfilePage(config.profile), ...pages]
      : pages;

    // JSON 保存
    const jsonPath = `${imageDir}-ocr.json`;
    const project = { pages: pagesWithProfile } satisfies Project;
    yield* saveJson(jsonPath, project);

    yield* Effect.logInfo(`Saved JSON to ${jsonPath}`);

    return jsonPath;
  });

/**
 * ディレクトリ内の PNG ファイル一覧を取得（ソート済み）
 */
const getImages = (dirPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(dirPath);

    const pngFiles = pipe(
      entries,
      Array.filter(e => e.toLowerCase().endsWith('.png')),
      Array.sort(
        Order.mapInput(Order.Number, (s: string) =>
          parseInt(s.replace(/\.png$/i, ''), 10),
        ),
      ),
    );

    return pngFiles.map(file => path.join(dirPath, file));
  });

const loadProgress = (progressPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    if (!(yield* fs.exists(progressPath))) return {} as Progress;
    const text = yield* fs.readFileString(progressPath);
    return yield* Effect.try(() => JSON.parse(text) as Progress);
  }).pipe(
    Effect.catch(e =>
      Effect.logWarning(`Failed to load progress, starting fresh: ${e}`).pipe(
        Effect.as({} as Progress),
      ),
    ),
  );

const saveProgress = (progressPath: string, progress: Progress) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    yield* fs.writeFileString(progressPath, JSON.stringify(progress, null, 2));
  }).pipe(
    Effect.catch(e => Effect.logWarning(`Failed to save progress: ${e}`)),
  );
