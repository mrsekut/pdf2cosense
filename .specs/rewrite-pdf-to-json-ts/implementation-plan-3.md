# Implementation Plan 3: ページ生成とレンダリング

## 目的

Gyazo アップロード + OCR からページを生成し、JSON 形式でレンダリングする。

## タスク

### Commit 1: ページレンダリング

- [ ] `src/pdf-to-json/renderPage.ts` を作成
  - `renderPage`: Page オブジェクトを生成
  - `createProfilePage`: Cosense API からプロファイルページを取得
  - `saveJson`: Project を JSON ファイルに保存

### Commit 2: ページ生成

- [ ] `src/pdf-to-json/generatePage.ts` を作成
  - `generatePage`: 画像 → Gyazo アップロード → OCR → Page
  - 10 秒待機後に OCR 取得
