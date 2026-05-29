const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function getConfig() {
  return {
    token: requireEnv("DISCORD_TOKEN"),
    clientId: requireEnv("DISCORD_CLIENT_ID"),
    guildId: requireEnv("DISCORD_GUILD_ID"),
    defaultReminderChannelId: process.env.REMINDER_CHANNEL_ID?.trim() || null,
    timezone: process.env.BOT_TIMEZONE?.trim() || "Asia/Tokyo"
  };
}

module.exports = { getConfig };
