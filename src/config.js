const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getConfig() {
  return {
    // Render の Web Service が渡すポート。設定されていれば収集結果を HTTP で公開する
    port: numberEnv("PORT", null),
    // 任意。あれば YouTube Data API を優先して使う（RSSより安定）
    youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim() || null,
    // 任意。Discord にも通知したいときの Webhook URL
    webhookUrl: process.env.DISCORD_WEBHOOK_URL?.trim() || null,
    dataDir: process.env.BOT_DATA_DIR?.trim()
      ? path.resolve(process.env.BOT_DATA_DIR.trim())
      : path.join(__dirname, "..", "data"),
    pollMinutes: numberEnv("POLL_MINUTES", 60),
    // これより古い動画は商品を拾わない（価格も在庫も変わっていて使えない）
    maxAgeDays: numberEnv("MAX_AGE_DAYS", 400),
    runOnce: process.argv.includes("--once")
  };
}

module.exports = { getConfig };
