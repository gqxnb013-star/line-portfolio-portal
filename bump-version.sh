#!/bin/sh
#
# キャッシュバスティング用バージョン文字列(?v=YYYYMMDDx)を一括更新する。
#
# LINEアプリ内のWebViewはHTML/JSを強くキャッシュするため、更新のたびに
# index.html と各jsのimport文に付けた ?v= を書き換える必要がある。
# これを手で揃えると必ず漏れが出る(実際に古いモジュールが混ざる事故が起きた)ので
# 常にこのスクリプトで一括更新する。
#
# 使い方:
#   ./bump-version.sh            今日の日付で自動採番(同日2回目以降は末尾の英字が進む)
#   ./bump-version.sh 20260901a  バージョンを明示して更新
#
# 注意: sed は macOS(BSD)の書式を使っている。
set -eu
cd "$(dirname "$0")"

# ?v= を含む可能性のあるファイル。新しいjsを追加したらここにも足すこと
TARGETS="index.html js/api.js js/app.js js/customer.js js/ifa.js js/ui.js"

current=$(grep -oE '\?v=[0-9a-z]+' index.html | head -n 1 | cut -c4-)
if [ -z "$current" ]; then
  echo "index.html に ?v= が見つかりません。対象を確認してください。" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  new=$1
else
  today=$(date +%Y%m%d)
  if [ "${current#"$today"}" != "$current" ]; then
    # 同じ日の2回目以降 → 末尾の英字を1つ進める(a → b → c ...)
    suffix=${current#"$today"}
    next=$(awk -v s="$suffix" 'BEGIN {
      letters = "abcdefghijklmnopqrstuvwxyz";
      i = index(letters, s);
      if (i == 0 || i >= 26) { print ""; } else { print substr(letters, i + 1, 1); }
    }')
    if [ -z "$next" ]; then
      echo "同日の採番が上限に達しました。バージョンを引数で指定してください(例: ./bump-version.sh ${today}z2)。" >&2
      exit 1
    fi
    new="$today$next"
  else
    new="${today}a"
  fi
fi

if [ "$new" = "$current" ]; then
  echo "バージョンが変わりません($current)。中断します。" >&2
  exit 1
fi

for file in $TARGETS; do
  [ -f "$file" ] || continue
  count=$(grep -cE '\?v=[0-9a-z]+' "$file" || true)
  [ "$count" -gt 0 ] || continue
  sed -i '' -E "s/\?v=[0-9a-z]+/?v=$new/g" "$file"
  echo "  $file ($count 箇所)"
done

# 書き換え漏れがあれば失敗として知らせる(揃っていないと古いモジュールが混ざるため)
remaining=$(grep -rhoE '\?v=[0-9a-z]+' $TARGETS 2>/dev/null | sort -u | grep -v "^?v=$new$" || true)
if [ -n "$remaining" ]; then
  echo "揃っていないバージョンが残っています: $remaining" >&2
  exit 1
fi

echo "バージョンを $current → $new に更新しました。"
