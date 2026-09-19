// 状態ファイルから、記事作成用のプール（Markdown と JSON）を組み立てる
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_VIDEO_DAYS = 14;
const MULTI_WINDOW_DAYS = 60;

function formatDate(iso) {
  if (!iso) return "日付不明";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

function escapeCell(text) {
  return String(text || "").replace(/\|/g, "／").replace(/\n/g, " ");
}

function latestMention(product) {
  return product.mentions.reduce((latest, mention) =>
    Date.parse(mention.publishedAt || 0) > Date.parse(latest.publishedAt || 0) ? mention : latest
  );
}

function buildFeed(state, channels) {
  const now = Date.now();
  const channelById = Object.fromEntries(channels.map((channel) => [channel.channelId, channel]));

  // 複数チャンネル紹介（直近 MULTI_WINDOW_DAYS 日に紹介があったもの）
  const multi = Object.entries(state.products)
    .map(([asin, product]) => ({
      asin,
      label: product.label,
      channels: [...new Set(product.mentions.map((mention) => mention.channelName))],
      latest: latestMention(product)
    }))
    .filter((item) => item.channels.length >= 2)
    .filter((item) => now - Date.parse(item.latest.publishedAt || 0) < MULTI_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => b.channels.length - a.channels.length || Date.parse(b.latest.publishedAt) - Date.parse(a.latest.publishedAt));

  // 直近の動画ごとの商品
  const productsByVideo = {};
  for (const [asin, product] of Object.entries(state.products)) {
    for (const mention of product.mentions) {
      (productsByVideo[mention.videoId] ||= []).push({ asin, label: product.label, others: product.mentions.length });
    }
  }
  const recentVideos = Object.entries(state.videos)
    .filter(([videoId]) => productsByVideo[videoId])
    .filter(([, video]) => now - Date.parse(video.publishedAt || 0) < RECENT_VIDEO_DAYS * DAY_MS)
    .sort(([, a], [, b]) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const lines = [
    "# ガジェット系YouTuber 自動収集プール",
    "",
    `- 最終更新: ${formatDate(new Date(now).toISOString())}（JST）`,
    "- 生成元: Render の gadget-watcher（`shion8120/reminder-discord-bot`）。**手で編集しない**（次回の更新で上書きされる）",
    "- リンクは紹介タグを外した `amazon.co.jp/dp/<ASIN>`。**記事では自分のタグ（shion8120-22）で張り直す**",
    "- 価格は動画公開時点の話。**必ずAmazonで今の価格を確認してから書く**",
    "- 使用済みの管理は `life/projects/note-youtuber-product-pool.md` 側で行う",
    "",
    `## ⭐ 複数チャンネルが別々に紹介した商品（直近${MULTI_WINDOW_DAYS}日）`,
    ""
  ];

  if (multi.length) {
    lines.push("| 商品（概要欄の表記） | ASIN | 紹介したチャンネル | 最新の紹介 |", "|---|---|---|---|");
    for (const item of multi) {
      lines.push(
        `| ${escapeCell(item.label) || "（名称なし）"} | [${item.asin}](https://www.amazon.co.jp/dp/${item.asin}) | ${escapeCell(item.channels.join("・"))} | ${formatDate(item.latest.publishedAt)} |`
      );
    }
  } else {
    lines.push("（まだなし）");
  }

  lines.push("", `## 🎬 直近${RECENT_VIDEO_DAYS}日の動画と紹介商品`, "");
  if (!recentVideos.length) lines.push("（まだなし）");
  for (const [videoId, video] of recentVideos) {
    const channel = channelById[video.channelId];
    lines.push(
      `### ${formatDate(video.publishedAt)} ${channel?.name || video.channelId}：${video.title}`,
      "",
      `- 動画: https://www.youtube.com/watch?v=${videoId}`,
      channel ? `- チャンネル: https://www.youtube.com/@${channel.handle}` : "",
      ""
    );
    for (const product of productsByVideo[videoId]) {
      const mark = product.others >= 2 ? " ⭐" : "";
      lines.push(`- ${product.label || "（名称なし）"} — https://www.amazon.co.jp/dp/${product.asin}${mark}`);
    }
    lines.push("");
  }

  return {
    markdown: `${lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim()}\n`,
    json: `${JSON.stringify({ generatedAt: new Date(now).toISOString(), channels, videos: state.videos, products: state.products }, null, 2)}\n`
  };
}

module.exports = { buildFeed };
