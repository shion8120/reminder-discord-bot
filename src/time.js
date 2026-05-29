const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function parseTokyoDateTime(input) {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(
    String(input || "").trim()
  );
  if (!match) {
    throw new Error("期限は `YYYY-MM-DD HH:mm` の形で入力してください。例: `2026-06-05 23:59`");
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("期限の日付または時刻が正しくありません。");
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - TOKYO_OFFSET_MS;
  const tokyoView = new Date(utcMs + TOKYO_OFFSET_MS);
  const isSame =
    tokyoView.getUTCFullYear() === year &&
    tokyoView.getUTCMonth() + 1 === month &&
    tokyoView.getUTCDate() === day &&
    tokyoView.getUTCHours() === hour &&
    tokyoView.getUTCMinutes() === minute;

  if (!isSame) {
    throw new Error("存在しない日付です。もう一度確認してください。");
  }

  return new Date(utcMs);
}

function formatTokyo(dateLike) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(dateLike));
}

function toDiscordTimestamp(dateLike, style = "F") {
  return `<t:${Math.floor(new Date(dateLike).getTime() / 1000)}:${style}>`;
}

function parseOffsetToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (["0", "due", "deadline"].includes(normalized)) {
    return 0;
  }

  const match = /^(\d+)([wdhm])$/.exec(normalized);
  if (!match) {
    throw new Error(
      "通知タイミングは `1w,1d,5h,0` のように入力してください。単位は w=週、d=日、h=時間、m=分、0=期限時刻です。"
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (amount <= 0) {
    throw new Error("通知タイミングの数字は 1 以上にしてください。");
  }

  const unitMs = {
    w: WEEK_MS,
    d: DAY_MS,
    h: HOUR_MS,
    m: MINUTE_MS
  }[unit];

  return amount * unitMs;
}

function parseOffsets(pattern, customOffsets) {
  const source = pattern === "custom" ? customOffsets : pattern;
  if (!source || !String(source).trim()) {
    throw new Error("カスタム通知を使う場合は `custom_offsets` に通知タイミングを入力してください。");
  }

  const offsets = String(source)
    .split(/[,\s、]+/)
    .filter(Boolean)
    .map(parseOffsetToken);

  return [...new Set(offsets)].sort((a, b) => b - a);
}

function describeOffset(offsetMs) {
  if (offsetMs === 0) return "期限時刻";
  if (offsetMs % WEEK_MS === 0) return `${offsetMs / WEEK_MS}週間前`;
  if (offsetMs % DAY_MS === 0) return `${offsetMs / DAY_MS}日前`;
  if (offsetMs % HOUR_MS === 0) return `${offsetMs / HOUR_MS}時間前`;
  return `${Math.round(offsetMs / MINUTE_MS)}分前`;
}

module.exports = {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  describeOffset,
  formatTokyo,
  parseOffsets,
  parseTokyoDateTime,
  toDiscordTimestamp
};
