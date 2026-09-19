# Gadget Watcher

ガジェット系YouTuberの新着動画を監視し、概要欄で紹介されたAmazon商品をDiscordに通知するワーカーです。
RenderのBackground Workerで動かします（サービス名は旧Botの `reminder-discord-bot` のまま流用）。

旧「授業リマインドBot」のコードは `archive/reminder-bot` ブランチに残っています。

## やること

- `channels.json` のチャンネルを `POLL_MINUTES` ごとに確認する
- 新着動画の概要欄から Amazon リンクを拾い、**ASINだけ**を取り出す
  - `amzlink.to` / `amzn.to` はリダイレクトをたどって ASIN を特定する
  - 他人のアフィリエイトタグは残さない。通知するのは `https://www.amazon.co.jp/dp/<ASIN>` だけ
  - まとめリスト（`/shop/.../list/...`）など ASIN のないリンクは捨てる
- 動画ごとに「🎬 チャンネル：タイトル」と商品一覧を通知する
- **2チャンネル以上が別々に紹介した商品**は「⭐ 複数チャンネル紹介」として1回だけ通知する

動画一覧の取り方は、`YOUTUBE_API_KEY` があれば Data API → RSS → チャンネルの動画タブ の順に試します。
RSS は 404 が頻発するため、キーを入れておくのがおすすめです（1回の確認で5ユニット程度。無料枠は1日1万）。

## 設定

| 環境変数 | 必須 | 内容 |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | ○ | 通知先チャンネルの Webhook URL。未設定ならコンソールに出す |
| `YOUTUBE_API_KEY` | | YouTube Data API v3 のキー |
| `POLL_MINUTES` | | 確認間隔（既定 30） |
| `INITIAL_LOOKBACK_DAYS` | | 初回起動時に通知する範囲（既定 3日）。古い動画は既読扱い |
| `BOT_DATA_DIR` | | 状態ファイルの置き場所。Render では `/var/data` |

状態は `BOT_DATA_DIR/gadget-watcher-state.json` に保存します（確認済み動画と、ASINごとの紹介履歴）。

## ローカルで試す

```powershell
Copy-Item .env.example .env
npm run once
```

`DISCORD_WEBHOOK_URL` を空にしておけば、Discord には送らずコンソールに出ます。

## Render

`render.yaml` のとおり Background Worker・Persistent Disk 1GB（`/var/data`）で動かします。
Render の環境変数に `DISCORD_WEBHOOK_URL`（と任意で `YOUTUBE_API_KEY`）を入れてください。
旧Botの `DISCORD_TOKEN` などは使わないので削除して構いません。
