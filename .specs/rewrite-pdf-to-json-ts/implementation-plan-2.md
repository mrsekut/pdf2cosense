# Implementation Plan 2: ファイル操作とPDF変換

## 目的

ファイル操作ユーティリティと PDF→画像変換を実装する。

## タスク

### Commit 1: ファイル操作ユーティリティ

- [ ] `src/pdf-to-json/files.ts` を作成
  - `getPdfPaths`: workspace 内の PDF ファイル一覧を取得
  - `getImageDirs`: workspace 内の画像ディレクトリ一覧を取得
  - `getImages`: ディレクトリ内の PNG ファイル一覧を取得（ソート済み）

### Commit 2: PDF→画像変換

- [ ] `src/pdf-to-json/pdfToImages.ts` を作成
  - `hasMutool`: mutool コマンドの存在確認
  - `pdfToImages`: 複数 PDF を画像に変換
  - `pdfToImagesOne`: 1つの PDF を画像に変換（mutool convert）
