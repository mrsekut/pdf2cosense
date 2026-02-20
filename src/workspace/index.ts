import { Effect } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';

/**
 * workspace 内の画像ディレクトリ一覧を取得
 */
const getImageDirs = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir);
    const fullPaths = entries.map(entry => path.join(workspaceDir, entry));

    return yield* Effect.filter(fullPaths, fullPath =>
      fs.stat(fullPath).pipe(
        Effect.map(stat => stat.type === 'Directory'),
        Effect.orElseSucceed(() => false),
      ),
    );
  });

/**
 * Phase 1: 変換が必要な PDF を取得
 * *.pdf のうち、同名ディレクトリがまだないもの
 */
export const getPdfsNeedingConversion = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir);
    const pdfFiles = entries.filter(e => e.toLowerCase().endsWith('.pdf'));

    return yield* Effect.filter(pdfFiles, pdfFile =>
      Effect.gen(function* () {
        const dirName = pdfFile.replace(/\.pdf$/i, '');
        const dirPath = path.join(workspaceDir, dirName);
        return !(yield* fs.exists(dirPath));
      }),
    ).pipe(Effect.map(files => files.map(f => path.join(workspaceDir, f))));
  });

/**
 * Phase 2: ISBN が未取得の画像ディレクトリを取得
 * 画像ディレクトリのうち、.isbn ファイルがないもの
 */
export const getDirsWithoutIsbn = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const dirs = yield* getImageDirs(workspaceDir);

    return yield* Effect.filter(dirs, dir =>
      fs.exists(path.join(dir, '.isbn')).pipe(Effect.map(exists => !exists)),
    );
  });

/**
 * Phase 3: JSON 未生成の本を取得
 * .isbn があるが -ocr.json がないもの
 */
export const getBooksWithoutJson = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const dirs = yield* getImageDirs(workspaceDir);

    const books = yield* Effect.filter(dirs, dir =>
      Effect.gen(function* () {
        const hasIsbn = yield* fs.exists(path.join(dir, '.isbn'));
        const hasJson = yield* fs.exists(`${dir}-ocr.json`);
        return hasIsbn && !hasJson;
      }),
    );

    return yield* Effect.forEach(books, dir =>
      Effect.gen(function* () {
        const isbn = yield* fs
          .readFileString(path.join(dir, '.isbn'))
          .pipe(Effect.map(s => s.trim()));
        return { imageDir: dir, isbn };
      }),
    );
  });

/**
 * Phase 4: インポート対象の JSON パスを取得
 */
export const getJsonPaths = (workspaceDir: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* fs.readDirectory(workspaceDir);

    return entries
      .filter(e => e.endsWith('-ocr.json'))
      .map(f => path.join(workspaceDir, f));
  });
