# 実装計画 1: 認証フロー

## 概要

Playwright を使った認証フローを実装する。初回ログイン時に `auth.json` を保存し、次回以降は再利用する。

## 対象ファイル

- `src/services/browser.ts` (新規)
- `src/services/auth.ts` (新規)
- `src/types.ts` (拡張)

## タスク

### 1. 型定義の追加

- [ ] `src/types.ts` に `AuthData` 型を追加

### 2. BrowserService の実装

- [ ] `src/services/browser.ts` を作成
- [ ] `BrowserError` エラー型を定義
- [ ] `LaunchOptions` 型を定義
- [ ] `BrowserService` を Context.Tag で定義
  - `launch`: ブラウザ起動（自動化検出回避設定込み）
  - `close`: ブラウザ終了
  - `saveStorageState`: 認証情報保存
- [ ] `BrowserServiceLive` Layer を実装

### 3. AuthService の実装

- [ ] `src/services/auth.ts` を作成
- [ ] `AuthError` エラー型を定義
- [ ] `AuthService` を Context.Tag で定義
  - `exists`: auth.json の存在確認
  - `load`: auth.json の読み込み
  - `getSid`: connect.sid の取得
  - `isValid`: 認証の有効性検証
- [ ] `AuthServiceLive` Layer を実装

### 4. 認証保存スクリプトの実装

- [ ] `src/services/auth.ts` に `saveAuth` Effect を追加
- [ ] `import.meta.main` で直接実行可能にする

## 動作確認

```bash
# 認証情報の保存
bun run src/services/auth.ts

# 期待される動作:
# 1. Chrome ブラウザが起動
# 2. scrapbox.io が表示される
# 3. ユーザーが Google ログインを完了
# 4. Enter を押すと auth.json が保存される
# 5. ブラウザが閉じる
```

## このフェーズ完了時点での cli.ts

変更なし（認証は個別実行のみ）
