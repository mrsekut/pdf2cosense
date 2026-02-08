# 要件定義書: pdf2cosense と Cosense プロジェクト統合

## 概要

PDF から生成された Cosense JSON を、新しい Cosense プロジェクトに自動インポートする機能を実装する。既存の Rust による PDF → JSON 変換パイプラインの後続処理として、TypeScript (Effect) で実装する。

## 背景

現在の pdf2cosense は以下のパイプラインが Rust で実装済み：
1. PDF を画像化
2. 画像を Gyazo にアップロード
3. OCR テキストを取得
4. Cosense JSON を生成・保存

本要件では、生成された JSON を Cosense に自動インポートするまでの一連の処理を追加する。

## 機能要件

### FR-1: ISBN 入力

- **FR-1.1**: 各 JSON ファイルに対してインタラクティブに ISBN を問い合わせる
  - JSON ファイル名とページ数を表示
  - stdin から ISBN を読み取る
  - 初期実装では OCR からの自動抽出は行わない
- **FR-1.2**: ISBN は 10桁または13桁の形式を許容する
- **FR-1.3**: ISBN のバリデーションを行う（オプション）
  - 形式チェック（数字とハイフンのみ）
  - チェックディジット検証（将来実装可）

### FR-2: 認証情報の管理

- **FR-2.1**: 初回実行時に Cosense（Scrapbox）へのログインを求める
  - Playwright で Chrome ブラウザを起動
  - ユーザーが手動で Google ログインを完了
  - ログイン完了後、ユーザーが Enter を押して続行
- **FR-2.2**: 認証情報を永続化する
  - `auth.json` ファイルに `storageState` を保存
  - 保存先: プロジェクトルートまたは `~/.pdf2cosense/auth.json`
- **FR-2.3**: 保存済み認証情報を再利用する
  - 次回以降は保存済みの `auth.json` を使用
  - 認証が無効な場合は再ログインを促す

### FR-3: Cosense プロジェクト作成

- **FR-3.1**: Playwright を使用してプロジェクトを自動作成する
  - URL: `https://scrapbox.io/projects/new`
- **FR-3.2**: フォームに以下の値を入力する
  - Project URL: `mrsekut-book-<ISBN>`
  - Visibility: `Private Project`（ラジオボタン）
  - Type: `Personal`（ラジオボタン）
  - Upload: `gyazo.com`（ラジオボタン）
- **FR-3.3**: Create ボタンをクリックしてプロジェクトを作成する
- **FR-3.4**: プロジェクト作成完了（リダイレクト）を待機する

### FR-4: JSON インポート

- **FR-4.1**: Cosense API を使用してページをインポートする
  - エンドポイント: `POST /api/page-data/import/<projectName>.json`
- **FR-4.2**: 認証には `connect.sid` Cookie と CSRF トークンを使用する
  - CSRF トークンは `/api/users/me` から取得
- **FR-4.3**: インポート結果を表示する
  - 成功: インポートされたページ数
  - 失敗: エラーメッセージ

### FR-5: CLI インターフェース

- **FR-5.1**: `bun run src/cli.ts` で一気通貫フローを実行する
  - PDF → JSON → プロジェクト作成 → インポート
  - 複数の JSON ファイルを順に処理
  - 各ファイルに対して ISBN をインタラクティブに問い合わせ
- **FR-5.2**: 各フェーズを個別に実行可能にする（開発・デバッグ用）
  - `bun run src/services/auth.ts`: 認証のみ
  - `bun run src/services/project.ts <isbn>`: プロジェクト作成のみ
  - `bun run src/services/import.ts <project> <json>`: インポートのみ

## 非機能要件

### NFR-1: コード品質

- **NFR-1.1**: Effect ライブラリを使用して副作用を管理する
  - すべての IO 操作は Effect でラップする
  - エラーハンドリングは Effect.fail / catchAll を使用
- **NFR-1.2**: 型安全性を確保する
  - すべての関数に適切な型定義を付与
  - Effect の型パラメータ（R, E, A）を明示する

### NFR-2: エラーハンドリング

- **NFR-2.1**: 各フェーズで発生しうるエラーを適切に処理する
  - 認証エラー: 再ログインを促す
  - ネットワークエラー: リトライまたはエラーメッセージ表示
  - プロジェクト作成エラー: 既存プロジェクトの確認を促す
  - インポートエラー: 詳細なエラーメッセージを表示

### NFR-3: ユーザー体験

- **NFR-3.1**: 各フェーズの進捗をコンソールに表示する
- **NFR-3.2**: エラー発生時に分かりやすいメッセージを表示する
- **NFR-3.3**: dry-run モードをサポートする（実際の操作を行わずに検証）

### NFR-4: 保守性

- **NFR-4.1**: 各フェーズは疎結合に設計する
  - ISBN 入力 / 認証 / プロジェクト作成 / インポート を独立したモジュールに
- **NFR-4.2**: 参考実装（/Users/mrsekut/Desktop/cosense）のパターンを踏襲する
  - Playwright の設定（自動化検出回避）
  - API クライアントの実装

## スコープ外

以下は本要件のスコープ外とする：

- OCR テキストからの ISBN 自動抽出（将来実装）
- ページのソートとピン留め（別途実装予定）
- Rust コードの TypeScript への移行（別途対応）
- 既存プロジェクトへの追加インポート

## 依存関係

- Playwright: ブラウザ自動化
- Effect / @effect/cli: CLI フレームワーク
- @effect/platform / @effect/platform-bun: ファイルシステム操作
- Bun: ランタイム

## 参考資料

- 参考実装: `/Users/mrsekut/Desktop/cosense`
  - `lib/browser.ts`: Playwright ヘルパー
  - `lib/cosense-api.ts`: Cosense API クライアント
  - `create-project.ts`: プロジェクト作成
  - `run.ts`: 統合ワークフロー
