# Implementation Plan 1: 基盤となる Service と型定義

## 目的

Gyazo Service、Config Service、および共通の型定義を実装する。

## タスク

### Commit 1: 型定義とエラー型

- [ ] `src/pdf-to-json/types.ts` を作成
  - `Page`, `Project` 型
  - `PdfToJsonError`, `GyazoError`, `MutoolError` エラー型

### Commit 2: Config Service

- [ ] `src/pdf-to-json/services/Config.ts` を作成
  - `Config` Service（Context.Tag）
  - `ConfigLive` Layer（環境変数から GYAZO_TOKEN 取得）

### Commit 3: Gyazo Service

- [ ] `src/pdf-to-json/services/Gyazo.ts` を作成
  - `Gyazo` Service（Context.Tag）
  - `upload`: 画像アップロード（Effect.retry で最大 5 回、3 秒間隔）
  - `getOcrText`: OCR テキスト取得（Effect.retry で最大 10 回、10 秒間隔）
  - `GyazoLive` Layer

### Commit 4: エクスポート

- [ ] `src/pdf-to-json/services/index.ts` を作成
- [ ] `src/pdf-to-json/index.ts` を作成（部分的）
