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

## 更新のたびに必ずやること

LINEアプリ内のWebViewはHTML/JSを強くキャッシュするため、`index.html`と各jsの
import文には`?v=YYYYMMDDx`を付けています。**この値が揃っていないと古いモジュールが
混ざります。** pushする前に必ず次を実行してください。

```sh
./bump-version.sh
```

同じ日に複数回更新した場合は末尾の英字が自動で進みます(`20260823a` → `20260823b`)。
新しいjsファイルを追加したときは、`bump-version.sh`の`TARGETS`にも追加してください。

なお、GitHub Pagesへの反映には30秒〜1分かかります。push直後の`curl`確認は
早すぎると古い内容を見ることになるので注意してください。
