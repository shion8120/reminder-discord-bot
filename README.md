# Gadget Watcher

ガジェット系YouTuberの新着動画を監視し、概要欄で紹介されたAmazon商品を集めて
GitHub リポジトリ `shion8120/gadget-feed` に書き込むワーカーです。
記事を書く側（毎晩の Claude の定期タスク）は、そのファイルを読むだけで題材を拾えます。

RenderのBackground Workerで動かします（サービス名は旧Botの `reminder-discord-bot` のまま流用）。
旧「授業リマインドBot」のコードは `archive/reminder-bot` ブランチに残っています。

## やること

- `channels.json` のチャンネルを `POLL_MINUTES` ごとに確認する
- 新着動画の概要欄から Amazon リンクを拾い、**ASINだけ**を取り出す
  - `amzlink.to` / `amzn.to` はリダイレクトをたどって ASIN を特定する
  - 他人のアフィリエイトタグは残さない。出すのは `https://www.amazon.co.jp/dp/<ASIN>` だけ
  - まとめリスト（`/shop/.../list/...`）など ASIN のないリンクは捨てる
- 中身が変わったときだけ、`gadget-feed` に次の2ファイルを書き込む
  - `youtuber-pool.md`：複数チャンネルが紹介した商品の表と、直近14日の動画ごとの商品
  - `youtuber-pool.json`：全データ
- `DISCORD_WEBHOOK_URL` があれば Discord にも通知する（任意）

動画一覧の取り方は、`YOUTUBE_API_KEY` があれば Data API → RSS → チャンネルの動画タブ の順に試します。
RSS は 404 が頻発するため、キーを入れておくのがおすすめです（1回の確認で5ユニット程度。無料枠は1日1万）。

## 設定

| 環境変数 | 必須 | 内容 |
|---|---|---|
| `GITHUB_TOKEN` | ○ | `gadget-feed` だけに Contents: Read and write を付けた fine-grained トークン |
| `GITHUB_REPO` | | 書き込み先（既定 `shion8120/gadget-feed`） |
| `YOUTUBE_API_KEY` | | YouTube Data API v3 のキー |
| `DISCORD_WEBHOOK_URL` | | Discord にも通知したいときの Webhook URL |
| `POLL_MINUTES` | | 確認間隔（既定 30） |
| `INITIAL_LOOKBACK_DAYS` | | 初回起動時に拾う範囲（既定 3日）。古い動画は既読扱い |
| `BOT_DATA_DIR` | | 状態ファイルの置き場所。Render では `/var/data` |

状態は `BOT_DATA_DIR/gadget-watcher-state.json` に保存します（確認済み動画と、ASINごとの紹介履歴）。

## ローカルで試す

```powershell
Copy-Item .env.example .env
npm run once
```

`GITHUB_TOKEN` と `DISCORD_WEBHOOK_URL` を空にしておけば、どこにも書き込まずコンソールに出ます。

## Render

`render.yaml` のとおり Background Worker・Persistent Disk 1GB（`/var/data`）で動かします。
Render の環境変数に `GITHUB_TOKEN`（と任意で `YOUTUBE_API_KEY`）を入れてください。
旧Botの `DISCORD_TOKEN` などは使わないので削除して構いません。
