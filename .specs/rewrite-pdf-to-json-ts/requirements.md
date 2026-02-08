# Requirements: pdf-to-json を TypeScript で再実装

## 概要

現在 Rust で実装されている `pdf-to-json` モジュールを TypeScript (Effect-TS) で再実装する。

## 機能要件

### 1. PDF から画像への変換

- workspace ディレクトリ内の PDF ファイルを検出する
- 各 PDF を PNG 画像に変換する（`mutool convert` を使用）
- 画像は `{PDFファイル名}/` ディレクトリに `1.png`, `2.png`, ... として保存
- DPI: 600, gamma: 1

### 2. Gyazo へのアップロード

- 各画像を Gyazo にアップロードする
- 直接 Gyazo API を使用（`gyazo-api` ライブラリを参考）
- リトライ機能付き（最大 5 回、3 秒間隔）
- アップロード後、`image_id` を取得

### 3. OCR テキスト取得

- Gyazo API (`GET /api/images/{image_id}`) で OCR テキストを取得
- OCR 完了まで待機（リトライ付き、最大 10 回、10 秒間隔）
- アップロード後 10 秒待ってから OCR 取得開始

### 4. Cosense ページ生成

- 各ページに以下を含む:
  - タイトル: ゼロパディングされたページ番号 (例: `00`, `01`)
  - prev/next リンク
  - Gyazo 画像の埋め込み (`[[https://gyazo.com/{image_id}]]`)
  - OCR テキスト（引用形式: `> {line}`）

### 5. プロファイルページ

- オプションで Cosense のプロファイルページを先頭に追加
- プロファイル: `mrsekut-merry-firends/mrsekut` (ハードコード)
- Cosense API からページ内容を取得

### 6. JSON 出力

- `{PDFファイル名}-ocr.json` として出力
- Cosense のインポート形式: `{ pages: [{ title, lines }] }`

## 非機能要件

### 並行処理

- 画像のアップロード/OCR は並行処理で実行
- セマフォで同時実行数を制限（最大 50）

### 進捗表示

- PDF 変換の進捗を表示
- ページ処理の進捗を表示

### エラーハンドリング

- Effect-TS の型安全なエラーハンドリング
- 個別ページの失敗はログ出力して継続

### 設定

- `GYAZO_TOKEN`: 環境変数から取得（`.env` ファイル対応）
- `workspace_dir`: `./workspace`
- `profile`: `mrsekut-merry-firends/mrsekut`

## 制約

- `mutool` コマンドが利用可能であること（`devbox shell` で提供）
- Gyazo API トークンが必要
- Bun ランタイムで実行

## 互換性

- 既存の Rust 実装と同じ JSON 形式を出力すること

## CLI 統合

- `cargo run` の呼び出しを削除
- TypeScript から直接 `pdfToJson` 関数を呼び出す形に変更
- `src/pdf-to-json.ts` を書き換え
