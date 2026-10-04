#!/usr/bin/env bash
# 動作確認用: smoke/sample.pdf（数ページの PDF）で Phase 1〜4 を一通り流す
#
# 使い方: devbox shell の中で `GYAZO_TOKEN=... ./smoke/run.sh`
#   - 本物の workspace/ とは別の smoke/workspace/ で動かす
#   - ISBN が見つからないダミーのタイトルにして、手入力のプロンプトに smoke0001 を流し込む
#     → Cosense に mrsekut-book-smoke0001 が作られる。確認後に手で消すこと（残っていると次回の作成に失敗する）
#   - 出力 JSON の Gyazo の画像 ID を伏せたものを smoke/result.json に保存し、
#     smoke/baseline.json があれば diff を取る
set -euo pipefail

cd "$(dirname "$0")"
: "${GYAZO_TOKEN:?GYAZO_TOKEN を設定してください}"
command -v mutool >/dev/null || { echo 'mutool がありません。devbox shell の中で実行してください' >&2; exit 1; }
[ -f sample.pdf ] || { echo 'smoke/sample.pdf がありません' >&2; exit 1; }

TITLE=zzqx-pdf2cosense-smoke

rm -rf workspace
mkdir workspace
cp sample.pdf "workspace/$TITLE.pdf"
ln -sfn ../browser-profile browser-profile # ログイン済みのプロファイルを使い回す

printf 'smoke0001\n' | bun run ../src/cli.ts

jq '.pages[].lines |= map(gsub("gyazo\\.com/[0-9a-f]+"; "gyazo.com/IMAGE_ID"))' \
  "workspace/$TITLE-ocr.json" > result.json

echo "created: https://scrapbox.io/$(cat "workspace/$TITLE/.project")/"
if [ -f baseline.json ]; then
  diff -u baseline.json result.json && echo 'baseline と一致'
else
  echo 'baseline.json がないので、result.json を baseline.json にコピーして基準にする'
fi
