import { Effect } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import * as Cosense from '../services/Cosense/index.ts';

/**
 * JSON ファイルを Cosense にインポート
 * jsonPath から対応する画像ディレクトリの .isbn を読み取り、
 * プロジェクト作成 + インポートを行う
 */
export const importToCosense = (jsonPath: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    // jsonPath: workspace/book-ocr.json → imageDir: workspace/book
    const imageDir = jsonPath.replace(/-ocr\.json$/, '');
    const isbn = yield* fs
      .readFileString(path.join(imageDir, '.isbn'))
      .pipe(Effect.map(s => s.trim()));

    yield* Effect.logInfo(`Importing: ${jsonPath} (ISBN: ${isbn})`);

    // プロジェクト作成
    const projectName = yield* Cosense.createProject(isbn);

    // インポート
    yield* Cosense.importJsonViaGui(projectName, jsonPath);

    yield* Effect.logInfo(`Completed: ${jsonPath} → ${projectName}`);

    return projectName;
  });
