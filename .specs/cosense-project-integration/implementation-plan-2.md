# 実装計画 2: プロジェクト作成

## 概要

Playwright を使って Cosense（Scrapbox）プロジェクトを自動作成する。
このフェーズ完了時点で、JSON 生成 → ISBN 入力 → プロジェクト作成 まで一気通貫で動くようにする。

## 前提条件

- 実装計画 1（認証フロー）が完了していること
- `auth.json` が存在すること

## 対象ファイル

- `src/services/project.ts` (新規)
- `src/cli.ts` (統合)

## タスク

### 1. ProjectService の実装

- [ ] `src/services/project.ts` を作成
- [ ] `ProjectError` エラー型を定義
- [ ] `CreateProjectOptions` 型を定義
- [ ] `ProjectService` を Context.Tag で定義
  - `create`: プロジェクト作成
- [ ] `ProjectServiceLive` Layer を実装
- [ ] `import.meta.main` で直接実行可能にする

### 2. インタラクティブ入力の実装

- [ ] ISBN を stdin から読み取る `promptIsbn` Effect を実装

### 3. cli.ts への統合

- [ ] 既存の `uploadToCosense` 呼び出しを一旦コメントアウト
- [ ] 新しいフローを実装:
  1. Rust で JSON 生成
  2. JSON ファイル一覧を取得
  3. 各ファイルに対して:
     - ファイル名・ページ数を表示
     - ISBN を問い合わせ
     - プロジェクト作成
  4. (インポートは次フェーズ)

## 動作確認

### 個別実行

```bash
bun run src/services/project.ts 9784297141554
```

### 一気通貫（プロジェクト作成まで）

```bash
bun run src/cli.ts

# 期待される動作:
# 1. Rust で PDF → JSON 変換
# 2. "Found 2 JSON files"
# 3. "Processing: book-a-ocr.json (120 pages)"
#    "Enter ISBN: " → ユーザーが入力
# 4. プロジェクト作成
# 5. "Processing: book-b-ocr.json (350 pages)"
#    "Enter ISBN: " → ユーザーが入力
# 6. プロジェクト作成
# 7. (インポートはスキップ)
```

## このフェーズ完了時点での cli.ts

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
    yield* Console.log(`✅ Project created: ${projectName}`);

    // TODO: インポート（次フェーズで実装）
  }

  yield* Console.log(`\n🎉 All ${jsonFiles.length} projects created!`);
});
```
