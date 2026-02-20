import { Effect } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import { IsbnSearch } from '../services/IsbnSearch/index.ts';

/**
 * ISBN を検索し、.isbn ファイルに保存する
 * 見つからない場合はスキップ
 */
export const searchAndSaveIsbn = (imageDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;
    const isbnSearch = yield* IsbnSearch;

    const dirName = path.basename(imageDir);
    yield* Effect.logInfo(`Searching ISBN for: ${dirName}`);

    const result = yield* isbnSearch.searchByTitle(dirName).pipe(
      Effect.catchTag('IsbnNotFoundError', e =>
        Effect.logWarning(`ISBN not found for "${e.title}", skipping...`).pipe(
          Effect.as(null),
        ),
      ),
      Effect.catchTag('ApiError', e =>
        Effect.logError(`API error: ${e.message}`).pipe(Effect.as(null)),
      ),
    );

    if (!result) return;

    yield* Effect.logInfo(
      `Found: "${result.title}" by ${result.authors.join(', ')} (ISBN: ${result.isbn})`,
    );

    // .isbn ファイルに保存
    yield* fs.writeFileString(path.join(imageDir, '.isbn'), result.isbn);
  });
