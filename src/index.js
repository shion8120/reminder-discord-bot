const channels = require("../channels.json");
const { extractProducts } = require("./amazon");
const { isSaleVideo } = require("./classify");
const { getConfig } = require("./config");
const { createNotifier } = require("./discord");
const { buildFeed } = require("./feed");
const { startServer } = require("./server");
const { createStore } = require("./storage");
const { listRecentVideos, searchChannel, completeVideo } = require("./youtube");
const { maybeCheckDeals } = require("./deals");

const COLOR_VIDEO = 0x3b82f6;
const COLOR_MULTI = 0xf59e0b;
const DAY_MS = 24 * 60 * 60 * 1000;
const VIDEO_DELAY_MS = 4000;
// 続けて弾かれたら、しばらく動画の取得を休む
const FAIL_LIMIT = 5;
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
// 動画タブに出ない古いセール動画は、チャンネル内検索で1日1回拾う
const SALE_QUERIES = ["セール", "プライムデー", "ブラックフライデー"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatDate(iso) {
  if (!iso) return "日付不明";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

function channelNamesOf(product) {
  return [...new Set(product.mentions.map((mention) => mention.channelName))];
}

function recordProducts(state, channel, video, products) {
  for (const product of products) {
    const entry = (state.products[product.asin] ||= {
      label: product.label,
      category: product.category,
      mentions: [],
      multiNotifiedAt: null
    });
    if (!entry.label && product.label) entry.label = product.label;
    if (!entry.category || entry.category === "unknown") entry.category = product.category;
    if (entry.mentions.some((mention) => mention.videoId === video.videoId)) continue;
    entry.mentions.push({
      channelId: channel.channelId,
      channelName: channel.name,
      videoId: video.videoId,
      publishedAt: video.publishedAt,
      isSale: video.isSale
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
    product.multiNotifiedAt = new Date().toISOString();
    if (!notifier.enabled) continue;
    await notifier.send({
      title: `⭐ 複数チャンネル紹介：${product.label || asin}`,
      url: `https://www.amazon.co.jp/dp/${asin}`,
      color: COLOR_MULTI,
      lines: [
        `**${names.length}チャンネルが別々に紹介**：${names.join("・")}`,
        `https://www.amazon.co.jp/dp/${asin}`,
        "",
        ...product.mentions.map(
          (mention) => `・${mention.channelName}（${formatDate(mention.publishedAt)}）https://www.youtube.com/watch?v=${mention.videoId}`
        )
      ]
    });
  }
}

async function candidateVideos(state, channel, config) {
  const listing = await listRecentVideos(channel, config.youtubeApiKey);
  const candidates = [...listing.videos];

  const lastSearch = Date.parse(state.searchedAt[channel.channelId] || 0);
  if (Date.now() - lastSearch > DAY_MS) {
    for (const query of SALE_QUERIES) {
      try {
        candidates.push(...(await searchChannel(channel, query)));
      } catch (error) {
        console.warn(`${channel.name} 検索「${query}」: ${error.message}`);
      }
      await sleep(VIDEO_DELAY_MS);
    }
    state.searchedAt[channel.channelId] = new Date().toISOString();
  }

  const seen = new Set();
  const fresh = candidates.filter((video) => {
    if (state.videos[video.videoId] || seen.has(video.videoId)) return false;
    seen.add(video.videoId);
    return true;
  });
  return { source: listing.source, fresh };
}

const channelById = new Map(channels.map((channel) => [channel.channelId, channel]));

async function processChannel(state, listedChannel, config, notifier) {
  const { source, fresh } = await candidateVideos(state, listedChannel, config);
  const cutoff = Date.now() - config.maxAgeDays * DAY_MS;
  let added = 0;
  let failed = 0;
  let streak = 0;

  for (const listed of fresh.reverse()) {
    if (state.videos[listed.videoId]) continue;
    let video;
    try {
      await sleep(VIDEO_DELAY_MS);
      video = await completeVideo(listed);
    } catch (error) {
      failed += 1;
      streak += 1;
      if (failed <= 2) console.warn(`${listedChannel.name}: ${error.message}`);
      if (streak >= FAIL_LIMIT) {
        state.blockedUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
        console.warn(`${listedChannel.name}: 連続${streak}件失敗。${COOLDOWN_MS / 60000}分休みます`);
        break;
      }
      continue;
    }

    // 検索結果に混ざった他チャンネルの動画は、本当の投稿者に付ける。対象外のチャンネルなら既読にするだけ
    const channel = channelById.get(video.channelId || listedChannel.channelId);
    if (!channel) {
      state.videos[video.videoId] = {
        channelId: video.channelId,
        title: video.title,
        publishedAt: video.publishedAt,
        isSale: false,
        productCount: 0,
        foreign: true,
        checkedAt: new Date().toISOString()
      };
      continue;
    }

    streak = 0;
    const record = {
      channelId: channel.channelId,
      title: video.title,
      publishedAt: video.publishedAt,
      isSale: isSaleVideo(video.title, video.description),
      productCount: 0,
      checkedAt: new Date().toISOString()
    };

    // 古すぎる動画は中身を見ずに既読にする（価格も在庫も変わっていて使えない）
    // 日付が取れなかった動画（/player で読んだもの）は新しいものとして扱う
    if (!video.publishedAt || Date.parse(video.publishedAt) >= cutoff) {
      const products = await extractProducts(video.description, video.title);
      record.productCount = products.length;
      recordProducts(state, channel, { ...video, isSale: record.isSale }, products);
      added += products.length;

      if (notifier.enabled && state.initializedAt && products.length) {
        await notifier.send({
          title: `${record.isSale ? "🛒" : "🎬"} ${channel.name}：${video.title}`,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          color: COLOR_VIDEO,
          lines: [
            `公開：${formatDate(video.publishedAt)}　チャンネル：https://www.youtube.com/@${channel.handle}`,
            `Amazon商品 ${products.length}件（紹介タグは外してある。記事では自分のタグで張り直す）`,
            "",
            ...productLines(state, channel, products)
          ]
        });
      }
    }
    state.videos[video.videoId] = record;
  }

  console.log(`${listedChannel.name}: 候補 ${fresh.length}本 / 読めず ${failed}本 / 商品 ${added}件 (${source})`);
}

async function checkOnce(config, store, notifier, onUpdate) {
  const state = await store.read();

  for (const channel of channels) {
    if (state.blockedUntil && Date.now() < Date.parse(state.blockedUntil)) {
      console.log(`休止中（${state.blockedUntil} まで）`);
      break;
    }
    try {
      await processChannel(state, channel, config, notifier);
    } catch (error) {
      console.warn(error.message);
    }
    await store.write(state);
    onUpdate(state);
  }

  try {
    await maybeCheckDeals(state, config);
  } catch (error) {
    console.warn(`セール確認: ${error.message}`);
  }

  await notifyMultiChannel(state, notifier);
  state.initializedAt ||= new Date().toISOString();
  state.lastCheckedAt = new Date().toISOString();
  await store.write(state);
  onUpdate(state);
}

async function main() {
  const config = getConfig();
  const store = createStore(config.dataDir);
  const notifier = createNotifier(config.webhookUrl);

  let feed = buildFeed(await store.read(), channels);
  const onUpdate = (state) => {
    feed = buildFeed(state, channels);
  };
  if (config.port) startServer(config.port, () => feed);

  console.log(`状態ファイル: ${store.stateFile} / 間隔: ${config.pollMinutes}分 / チャンネル: ${channels.length}`);

  for (;;) {
    try {
      await checkOnce(config, store, notifier, onUpdate);
    } catch (error) {
      console.error(error);
    }
    if (config.runOnce) break;
    await sleep(config.pollMinutes * 60 * 1000);
  }
}

process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
