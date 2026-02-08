# 実装計画 3: JSON インポート（完成）

## 概要

Cosense API を使って JSON ファイルからページをインポートする。
このフェーズで全機能が完成し、一気通貫で動くようになる。

## 前提条件

- 実装計画 1〜2 が完了していること
- `auth.json` が存在すること

## 対象ファイル

- `src/services/cosense-api.ts` (新規)
- `src/services/import.ts` (新規)
- `src/cli.ts` (統合完了)
- `src/uploader.ts` (削除)

## タスク

### 1. CosenseApiService の実装

- [ ] `src/services/cosense-api.ts` を作成
- [ ] `CosenseApiError` エラー型を定義
- [ ] `CosenseApiService` を Context.Tag で定義
  - `getCsrfToken`: CSRF トークン取得
  - `importPages`: ページインポート
- [ ] `CosenseApiServiceLive` Layer を実装

### 2. ImportService の実装

- [ ] `src/services/import.ts` を作成
- [ ] `ImportError` エラー型を定義
- [ ] `ImportService` を Context.Tag で定義
  - `importFromFile`: JSON ファイルからインポート
- [ ] `ImportServiceLive` Layer を実装
- [ ] `import.meta.main` で直接実行可能にする

### 3. cli.ts への統合（完成）

- [ ] インポート処理を追加
- [ ] 古い `uploader.ts` を削除

## 動作確認

### 個別実行

```bash
bun run src/services/import.ts mrsekut-book-9784297141554 workspace/book-ocr.json
```

### 一気通貫（完成版）

```bash
bun run src/cli.ts

# 期待される動作:
# 1. Rust で PDF → JSON 変換
# 2. "Found 2 JSON files"
# 3. "Processing: book-a-ocr.json (120 pages)"
#    "Enter ISBN: " → ユーザーが入力
# 4. プロジェクト作成
# 5. 3秒待機
# 6. インポート
# 7. "Processing: book-b-ocr.json"
#    ...
# 8. "All 2 books processed!"
```

## このフェーズ完了時点での cli.ts（最終形）

```typescript
Effect.gen(function* () {
  // 1. JSON 生成（Rust）
  const jsonFiles = yield* runPdfToJson;
  yield* Console.log(`Found ${jsonFiles.length} JSON files`);

  // 2. 各 JSON ファイルを処理
  for (const jsonFile of jsonFiles) {
    const pageCount = yield* getPageCount(jsonFile);
    yield* Console.log(`\n📚 Processing: ${path.basename(jsonFile)} (${pageCount} pages)`);

    // ISBN を問い合わせ
    const isbn = yield* promptIsbn();

    // プロジェクト作成
    yield* Console.log(`🆕 Creating project: mrsekut-book-${isbn}...`);
    const projectName = yield* projectService.create({ isbn });
    yield* Console.log(`✅ Project created`);

    // API 認識待ち
    yield* Effect.sleep("3 seconds");

    // インポート
    yield* Console.log(`📤 Importing ${pageCount} pages...`);
    yield* importService.importFromFile(projectName, jsonFile);
    yield* Console.log(`✅ Done`);
  }

  yield* Console.log(`\n🎉 All ${jsonFiles.length} books processed!`);
});
```
