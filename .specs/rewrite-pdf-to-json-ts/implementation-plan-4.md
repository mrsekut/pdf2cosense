# Implementation Plan 4: メイン処理と CLI 統合

## 目的

全体の処理フローを組み立て、CLI から呼び出せるようにする。

## タスク

### Commit 1: メイン処理

- [ ] `src/pdf-to-json/pdfToJson.ts` を作成
  - `pdfToJson`: メインの Effect
  - `dirToCosense`: 1つのディレクトリを処理
  - `processImagesConcurrently`: 並行でページ生成

### Commit 2: エクスポート完成

- [ ] `src/pdf-to-json/index.ts` を完成
  - 全モジュールのエクスポート
  - Layer の組み立て

### Commit 3: CLI 統合

- [ ] `src/pdf-to-json.ts` を書き換え
  - `cargo run` の呼び出しを削除
  - `pdfToJson` を直接呼び出す

### Commit 4: クリーンアップ

- [ ] 不要になった Rust コードへの参照を削除
- [ ] 動作確認
