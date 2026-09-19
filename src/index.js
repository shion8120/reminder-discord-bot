const crypto = require("crypto");
const channels = require("../channels.json");
const { extractProducts } = require("./amazon");
const { getConfig } = require("./config");
const { createNotifier } = require("./discord");
const { buildFeed } = require("./feed");
const { createPublisher } = require("./github");
const { createStore } = require("./storage");
const { listRecentVideos, completeVideo } = require("./youtube");

const COLOR_VIDEO = 0x3b82f6;
const COLOR_MULTI = 0xf59e0b;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(iso) {
  if (!iso) return "日付不明";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

function channelNamesOf(product) {
  return [...new Set(product.mentions.map((mention) => mention.channelName))];
}

function recordProducts(state, channel, video, products) {
  for (const product of products) {
    const entry = (state.products[product.asin] ||= { label: product.label, mentions: [], multiNotifiedAt: null });
    if (!entry.label && product.label) entry.label = product.label;
    if (entry.mentions.some((mention) => mention.videoId === video.videoId)) continue;
    entry.mentions.push({
      channelId: channel.channelId,
      channelName: channel.name,
      videoId: video.videoId,
      publishedAt: video.publishedAt
    });
  }
}

function productLines(state, channel, products) {
  return products.map((product) => {
    const others = channelNamesOf(state.products[product.asin]).filter((name) => name !== channel.name);
    const also = others.length ? `  **（${others.join("・")} も紹介）**` : "";
    return `・${product.label || "（名称なし）"}\n　${product.url}${also}`;
  });
}

async function notifyMultiChannel(state, notifier) {
  for (const [asin, product] of Object.entries(state.products)) {
    const names = channelNamesOf(product);
    if (names.length < 2 || product.multiNotifiedAt) continue;
    const lines = [
      `**${names.length}チャンネルが別々に紹介**：${names.join("・")}`,
      `https://www.amazon.co.jp/dp/${asin}`,
      "",
      ...product.mentions.map(
        (mention) => `・${mention.channelName}（${formatDate(mention.publishedAt)}）https://www.youtube.com/watch?v=${mention.videoId}`
      )
    ];
    await notifier.send({
      title: `⭐ 複数チャンネル紹介：${product.label || asin}`,
      url: `https://www.amazon.co.jp/dp/${asin}`,
      color: COLOR_MULTI,
      lines
    });
    product.multiNotifiedAt = new Date().toISOString();
  }
}

// 中身（動画・商品）が前回から変わったときだけ GitHub に書き込む
async function publishFeed(state, publisher) {
  if (!publisher) return;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ videos: state.videos, products: state.products }))
    .digest("hex");
  if (hash === state.publishedHash) return;

  const feed = buildFeed(state, channels);
  const message = `Update YouTuber product pool (${Object.keys(state.videos).length} videos)`;
  await publisher.putFile("youtuber-pool.md", feed.markdown, message);
  await publisher.putFile("youtuber-pool.json", feed.json, message);
  state.publishedHash = hash;
  console.log(`GitHub に書き込みました: ${publisher.target}`);
}

async function checkOnce(config, store, notifier, publisher) {
  const state = await store.read();
  const firstRun = !state.initializedAt;
  const cutoff = Date.now() - config.initialLookbackDays * DAY_MS;

  for (const channel of channels) {
    let listing;
    try {
      listing = await listRecentVideos(channel, config.youtubeApiKey);
    } catch (error) {
      console.warn(error.message);
      continue;
    }

    // 古い順に処理して、Discord 上も時系列に並べる
    for (const listed of [...listing.videos].reverse()) {
      if (state.videos[listed.videoId]) continue;

      let video;
      try {
        video = await completeVideo(listed);
      } catch (error) {
        console.warn(`${channel.name}: ${error.message}`);
        continue;
      }

      const isOld = !video.publishedAt || Date.parse(video.publishedAt) < cutoff;
      if (!(firstRun && isOld)) {
        const products = await extractProducts(video.description);
        recordProducts(state, channel, video, products);
        await notifier.send({
          title: `🎬 ${channel.name}：${video.title}`,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          color: COLOR_VIDEO,
          lines: [
            `公開：${formatDate(video.publishedAt)}　チャンネル：https://www.youtube.com/@${channel.handle}`,
            `Amazon商品 ${products.length}件（リンクは紹介タグを外したもの。記事では自分のタグで張り直す）`,
            "",
            ...productLines(state, channel, products)
          ]
        });
      }

      state.videos[video.videoId] = {
        channelId: channel.channelId,
        title: video.title,
        publishedAt: video.publishedAt,
        checkedAt: new Date().toISOString()
      };
      await store.write(state);
    }
    console.log(`${channel.name}: ${listing.videos.length}件確認 (${listing.source})`);
  }

  await notifyMultiChannel(state, notifier);
  state.initializedAt ||= new Date().toISOString();
  await store.write(state);

  try {
    await publishFeed(state, publisher);
    await store.write(state);
  } catch (error) {
    console.error(error.message);
  }
}

async function main() {
  const config = getConfig();
  const store = createStore(config.dataDir);
  const notifier = createNotifier(config.webhookUrl);
  const publisher = createPublisher(config.github);

  if (!config.webhookUrl) console.log("DISCORD_WEBHOOK_URL 未設定のため、通知はコンソールに出します");
  if (!publisher) console.log("GITHUB_TOKEN 未設定のため、GitHub には書き込みません");
  console.log(`状態ファイル: ${store.stateFile} / 間隔: ${config.pollMinutes}分`);

  for (;;) {
    try {
      await checkOnce(config, store, notifier, publisher);
    } catch (error) {
      console.error(error);
    }
    if (config.runOnce) break;
    await new Promise((resolve) => setTimeout(resolve, config.pollMinutes * 60 * 1000));
  }
}

process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
