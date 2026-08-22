# 資産管理ポータル(LIFFフロントエンド)

LINE公式アカウント経由で顧客が保険・投資・銀行資産・家計内訳を確認できるポータルの
フロントエンドです。GitHub Pagesで配信し、バックエンド(Google Apps Script)の
JSON APIを`fetch`で呼び出します。

## なぜ静的ホスティングなのか

`liff.init()`はLIFFに登録したエンドポイントURLと同一またはその配下のURLでしか
動作が保証されません。GAS Web Appは配信するHTMLを必ず別オリジン
(`googleusercontent.com`)のiframe内で実行するため、この条件を構造上満たせません。
そのためフロントエンドは静的ホスティングに置き、GASはJSON APIとしてのみ使います。

## 構成

- `index.html` — LIFF初期化・ロール判定・PIN連携・IFA本人登録
- バックエンド — `../gas/` 配下(このリポジトリには含まれません)

`index.html`冒頭の`LIFF_ID`と`API_URL`が環境依存の値です。GASを再デプロイして
exec URLが変わった場合は`API_URL`の更新が必要です。
