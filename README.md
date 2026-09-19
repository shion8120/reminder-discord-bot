# Gadget Watcher

人気のガジェット系YouTuber（`channels.json`、26チャンネル）が紹介したAmazon商品を集め、
記事ネタのプールとして HTTP で公開する Render の Web Service です。**特にAmazonセールの紹介動画を重点的に拾います。**

- `GET /youtuber-pool.md` … 記事作成用のまとめ（`/` も同じ）
- `GET /youtuber-pool.json` … 全データ
- `GET /healthz` … ヘルスチェック

毎晩の記事作成タスク（Claude）はこの URL を読むだけで題材を拾えます。鍵やトークンは不要です
（公開しているのは YouTube の公開情報と ASIN だけ）。

旧「授業リマインドBot」は `main` ブランチのまま残っています。このワーカーは `gadget-watcher` ブランチから動かします。

## 集め方

1. 各チャンネルの動画タブ（新しい約30本）を `POLL_MINUTES` ごとに確認する
2. 1日1回、チャンネル内検索（「セール」「プライムデー」「ブラックフライデー」）で古いセール動画も掘り起こす
3. 動画ページから概要欄を読み、Amazon リンクを **ASINだけ** にする
   - `amzlink.to` / `amzn.to` はリダイレクトをたどって ASIN を特定する
   - 他人のアフィリエイトタグは残さない。出すのは `https://www.amazon.co.jp/dp/<ASIN>` だけ
4. `MAX_AGE_DAYS`（既定400日）より古い動画は中身を見ずに既読にする

## 除外するもの（`src/classify.js` / `src/amazon.js`）

- ASIN のないリンク（まとめリスト、キャンペーンページ、ストアフロント）
- 商品名がキャンペーン・サブスク・ギフト券・食品・飲料・サプリ・医薬品・美容・衣類のもの
- 概要欄の「使用機材」「撮影機材」「BGM」「お仕事依頼」などの節にあるリンク

残した商品は `gadget`（ガジェット）／`appliance`（家電）／`life`（生活用品）／`unknown` に分類します。
`life` はサブアカウント向けに別の節へ分けます。動画タイトルからセール・まとめ紹介動画かどうかも判定します。

## 設定

| 環境変数 | 内容 |
|---|---|
| `PORT` | Render が自動で入れる。設定されていると HTTP で公開する |
| `BOT_DATA_DIR` | 状態ファイルの置き場所。Render では `/var/data`（Persistent Disk） |
| `POLL_MINUTES` | 確認間隔（既定 60） |
| `MAX_AGE_DAYS` | これより古い動画は商品を拾わない（既定 400） |
| `YOUTUBE_API_KEY` | 任意。YouTube Data API v3 のキー |
| `DISCORD_WEBHOOK_URL` | 任意。Discord にも通知したいとき |

## ローカルで試す

```powershell
npm run once
```

`data/gadget-watcher-state.json` に結果がたまります。`PORT=3000` を付けると `http://localhost:3000/` で見られます。
