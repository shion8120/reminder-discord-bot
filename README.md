# Reminder Discord Bot

授業チャンネルごとのロール付与と、課題・テストのリマインドを行うDiscord Botです。RenderのBackground Workerで動かす前提の設定を含んでいます。

## 主な機能

- `/classes sync`: 授業名のテキストチャンネルと同名のロールを作成
- `/classes panel`: リアクションで授業ロールを付与・解除
- `/reminder create`: 課題またはテストの期限、範囲、通知タイミングを登録
- 指定時刻に授業ロール宛てでリマインドを送信
- リマインド投稿に `✅ 終わった / 🔄 やってる / 🕒 まだやってない` のリアクションを追加

## ローカル準備

```powershell
npm install
Copy-Item .env.example .env
```

`.env` にDiscord Botの情報を入れます。

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-client-id
DISCORD_GUILD_ID=your-server-guild-id
REMINDER_CHANNEL_ID=
BOT_TIMEZONE=Asia/Tokyo
BOT_DATA_DIR=
```

スラッシュコマンド登録:

```powershell
npm run deploy
```

起動:

```powershell
npm start
```

## Render

このBotはWeb Serviceではなく、Background Workerとして動かします。`render.yaml` を置いているので、RenderのBlueprintから作成できます。

設定:

- Service type: `Background Worker`
- Build Command: `npm ci`
- Start Command: `npm run render-start`
- Node version: `24.16.0`
- Persistent Disk: `1GB`
- Disk mount path: `/var/data`

Renderの環境変数:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-client-id
DISCORD_GUILD_ID=your-server-guild-id
REMINDER_CHANNEL_ID=
BOT_TIMEZONE=Asia/Tokyo
BOT_DATA_DIR=/var/data
```

`npm run render-start` は、起動時にスラッシュコマンドを登録してからBot本体を開始します。

## Discord側の設定

Discord Developer PortalでBotを作成し、`SERVER MEMBERS INTENT` を有効にしてください。

Botに必要な権限:

- Manage Roles
- Send Messages
- Embed Links
- Add Reactions
- Read Message History
- Use Slash Commands

Botのロールは、Botが付け外しする授業ロールより上に置く必要があります。

## 使い方

1. 授業名のテキストチャンネルを作る
2. `/classes sync` を実行してロールを作る
3. `/classes panel` を実行してリアクションロール案内を投稿する
4. `/reminder create` で課題・テストのリマインドを登録する

通知タイミングのカスタム入力例:

```text
2w,3d,12h,0
```

- `w`: 週
- `d`: 日
- `h`: 時間
- `m`: 分
- `0`: 期限時刻

保存データは通常 `data/bot-state.json`、Renderでは `/var/data/bot-state.json` に保存されます。
