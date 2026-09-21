// 状態ファイルから、記事作成用のプール（Markdown と JSON）を組み立てる
const DAY_MS = 24 * 60 * 60 * 1000;
const MULTI_WINDOW_DAYS = 120;
const MULTI_LIMIT = 100;
const SALE_VIDEO_DAYS = 30;
const NORMAL_VIDEO_DAYS = 14;
const LIFE_WINDOW_DAYS = 60;
const LIFE_LIMIT = 60;

const CATEGORY_LABEL = { gadget: "ガジェット", appliance: "家電", life: "生活", unknown: "未分類" };
const ARTICLE_CATEGORIES = new Set(["gadget", "appliance", "unknown"]);

function formatDate(iso) {
  if (!iso) return "日付不明";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

function formatDay(iso) {
  if (!iso) return "日付不明";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function cell(text) {
  return String(text || "").replace(/\|/g, "／").replace(/\n/g, " ");
}

function ageMs(iso) {
  return Date.now() - Date.parse(iso || 0);
}

function summarize(asin, product) {
  const channels = [...new Set(product.mentions.map((mention) => mention.channelName))];
  const latest = product.mentions.reduce((a, b) => (Date.parse(b.publishedAt || 0) > Date.parse(a.publishedAt || 0) ? b : a));
  return {
    asin,
    label: product.label,
    category: product.category || "unknown",
    channels,
    latest,
    saleMentions: product.mentions.filter((mention) => mention.isSale).length
  };
}

function productLine(item) {
  const others = item.channels.length >= 2 ? ` ⭐${item.channels.length}ch` : "";
  const category = item.category === "gadget" ? "" : `［${CATEGORY_LABEL[item.category]}］`;
  return `- ${category}${item.label || "（名称なし）"} — https://www.amazon.co.jp/dp/${item.asin}${others}`;
}

function buildFeed(state, channels) {
  const now = Date.now();
  const channelById = Object.fromEntries(channels.map((channel) => [channel.channelId, channel]));
  const items = Object.entries(state.products).map(([asin, product]) => summarize(asin, product));
  const itemByAsin = Object.fromEntries(items.map((item) => [item.asin, item]));

  const productsByVideo = {};
  for (const [asin, product] of Object.entries(state.products)) {
    for (const mention of product.mentions) (productsByVideo[mention.videoId] ||= []).push(itemByAsin[asin]);
  }

  const videos = Object.entries(state.videos)
    .map(([videoId, video]) => ({ videoId, ...video, channel: channelById[video.channelId] }))
    .filter((video) => video.productCount > 0)
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));

  const multi = items
    .filter((item) => item.channels.length >= 2 && ARTICLE_CATEGORIES.has(item.category))
    .filter((item) => ageMs(item.latest.publishedAt) < MULTI_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => b.channels.length - a.channels.length || b.saleMentions - a.saleMentions || Date.parse(b.latest.publishedAt) - Date.parse(a.latest.publishedAt))
    .slice(0, MULTI_LIMIT);

  const counts = items.reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + 1 }), {});
  const lines = [
    "# ガジェット系YouTuber 自動収集プール",
    "",
    `- 最終確認: ${formatDate(state.lastCheckedAt)}（JST）／対象 ${channels.length}チャンネル／確認済み動画 ${Object.keys(state.videos).length}本`,
    `- 商品: ガジェット ${counts.gadget || 0}／家電 ${counts.appliance || 0}／生活 ${counts.life || 0}／未分類 ${counts.unknown || 0}（キャンペーン・食品・医薬品・衣類・美容・撮影機材の節は除外済み）`,
    "- 生成元: Render の gadget-watcher。全データは同じURLの `/youtuber-pool.json`",
    "- リンクは紹介タグを外した `amazon.co.jp/dp/<ASIN>`。**記事では自分のタグ（shion8120-22）で張り直す**",
    "- 価格は動画公開時点の話。**必ずAmazonで今の価格を確認してから書く**",
    "- 使用済みの管理は `life/projects/note-youtuber-product-pool.md` 側で行う",
    "",
    `## ⭐ 複数チャンネルが別々に紹介した商品（直近${MULTI_WINDOW_DAYS}日・上位${MULTI_LIMIT}）`,
    ""
  ];

  if (multi.length) {
    lines.push("| 商品（概要欄の表記） | 分類 | ASIN | ch数 | 紹介したチャンネル | うちセール動画 | 最新の紹介 |", "|---|---|---|---|---|---|---|");
    for (const item of multi) {
      lines.push(
        `| ${cell(item.label) || "（名称なし）"} | ${CATEGORY_LABEL[item.category]} | [${item.asin}](https://www.amazon.co.jp/dp/${item.asin}) | ${item.channels.length} | ${cell(item.channels.join("・"))} | ${item.saleMentions} | ${formatDay(item.latest.publishedAt)} |`
      );
    }
  } else {
    lines.push("（まだなし）");
  }

  const videoBlock = (video) => {
    const products = (productsByVideo[video.videoId] || []).filter((item) => ARTICLE_CATEGORIES.has(item.category));
    const lifeCount = (productsByVideo[video.videoId] || []).length - products.length;
    const block = [
      `### ${formatDay(video.publishedAt)} ${video.channel?.name || video.channelId}：${video.title}`,
      "",
      `- 動画: https://www.youtube.com/watch?v=${video.videoId}` +
        (video.channel ? `　チャンネル: https://www.youtube.com/@${video.channel.handle}` : ""),
      ""
    ];
    block.push(...products.map(productLine));
    if (lifeCount) block.push(`- （ほか生活用品 ${lifeCount}件 → 下の「生活用品」節）`);
    block.push("");
    return block;
  };

  lines.push("", `## 🛒 Amazonセール・まとめ紹介動画（直近${SALE_VIDEO_DAYS}日）`, "");
  const saleVideos = videos.filter((video) => video.isSale && ageMs(video.publishedAt) < SALE_VIDEO_DAYS * DAY_MS);
  if (!saleVideos.length) lines.push("（なし）", "");
  for (const video of saleVideos) lines.push(...videoBlock(video));

  lines.push(`## 🎬 その他の動画（直近${NORMAL_VIDEO_DAYS}日）`, "");
  const normalVideos = videos.filter((video) => !video.isSale && ageMs(video.publishedAt) < NORMAL_VIDEO_DAYS * DAY_MS);
  if (!normalVideos.length) lines.push("（なし）", "");
  for (const video of normalVideos) lines.push(...videoBlock(video));

  lines.push(`## 🧺 生活用品（サブアカウント shion_nayami 向け候補・直近${LIFE_WINDOW_DAYS}日）`, "");
  const life = items
    .filter((item) => item.category === "life" && ageMs(item.latest.publishedAt) < LIFE_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => b.channels.length - a.channels.length || Date.parse(b.latest.publishedAt) - Date.parse(a.latest.publishedAt))
    .slice(0, LIFE_LIMIT);
  if (!life.length) lines.push("（なし）");
  for (const item of life) lines.push(`${productLine(item)}（${cell(item.channels.join("・"))}）`);

  // Amazonのセール一覧から拾った候補（1日2回の自動確認）
  const deals = Object.entries(state.deals || {})
    .filter(([, deal]) => now - Date.parse(deal.seenAt || 0) < 7 * DAY_MS)
    .sort((a, b) => String(b[1].seenAt).localeCompare(String(a[1].seenAt)));
  lines.push("", "## 🏷 Amazonセール候補（自動収集・直近7日）", "");
  if (!deals.length) lines.push("（なし）");
  for (const [asin, deal] of deals) {
    const price = deal.price ? ` — ${deal.price.toLocaleString("ja-JP")}円（要確認）` : "（価格は要確認）";
    const label = deal.category === "appliance" ? "［家電］" : "";
    lines.push(`- ${label}${deal.title || asin}${price} https://www.amazon.co.jp/dp/${asin}`);
  }

  lines.push("", `## 📚 過去のセール動画（${SALE_VIDEO_DAYS}日より前。商品は JSON を参照）`, "");
  const pastSales = videos.filter((video) => video.isSale && ageMs(video.publishedAt) >= SALE_VIDEO_DAYS * DAY_MS);
  if (!pastSales.length) lines.push("（なし）");
  for (const video of pastSales) {
    lines.push(
      `- ${formatDay(video.publishedAt)} ${video.channel?.name || video.channelId}：${video.title}（${video.productCount}件） https://www.youtube.com/watch?v=${video.videoId}`
    );
  }

  return {
    markdown: `${lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim()}\n`,
    json: `${JSON.stringify(
      { generatedAt: new Date().toISOString(), lastCheckedAt: state.lastCheckedAt, channels, videos: state.videos, products: state.products, deals: state.deals || {}, dealsCheckedAt: state.dealsCheckedAt || null },
      null,
      2
    )}\n`
  };
}

module.exports = { buildFeed };
