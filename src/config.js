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
    // 収集結果の書き込み先（記事を書く側はここを読む）。トークン未設定なら書き込まない
    github: {
      token: process.env.GITHUB_TOKEN?.trim() || null,
      repo: process.env.GITHUB_REPO?.trim() || "shion8120/gadget-feed",
      branch: process.env.GITHUB_BRANCH?.trim() || "main"
    },
    // 任意。未設定なら通知はコンソールに出す
    webhookUrl: process.env.DISCORD_WEBHOOK_URL?.trim() || null,
    // 任意。あれば YouTube Data API を優先して使う（RSSより安定）
    youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim() || null,
    dataDir: process.env.BOT_DATA_DIR?.trim()
      ? path.resolve(process.env.BOT_DATA_DIR.trim())
      : path.join(__dirname, "..", "data"),
    pollMinutes: numberEnv("POLL_MINUTES", 30),
    // 初回起動時に遡る日数。これより古い動画は「既読」扱いにして通知しない
    initialLookbackDays: numberEnv("INITIAL_LOOKBACK_DAYS", 3),
    runOnce: process.argv.includes("--once")
  };
}

module.exports = { getConfig };
