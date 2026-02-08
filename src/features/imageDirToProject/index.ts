import { Effect } from 'effect';
import { imagesToJson } from '../imageToJson/index.ts';
import * as Cosense from '../../Cosense/index.ts';

/**
 * 画像ディレクトリから Cosense プロジェクトまで処理
 */
export const imageDirToProject = (imageDir: string, isbn: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Processing: ${imageDir}`);

    // 1. 画像 → JSON
    const jsonPath = yield* imagesToJson(imageDir);

    // 2. プロジェクト作成
    const projectName = yield* Cosense.createProject(isbn);

    // 3. インポート
    yield* Cosense.importJsonViaGui(projectName, jsonPath);

    yield* Effect.logInfo(`Completed: ${imageDir} → ${projectName}`);

    return projectName;
  });
