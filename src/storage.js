const fs = require("fs/promises");
const path = require("path");

function createDefaultState() {
  return {
    version: 2,
    initializedAt: null,
    lastCheckedAt: null,
    // channelId -> 最後にチャンネル内検索（セール動画の掘り起こし）をした時刻
    searchedAt: {},
    // videoId -> { channelId, title, publishedAt, isSale, productCount, checkedAt }
    videos: {},
    // ASIN -> { label, category, mentions: [{ channelId, channelName, videoId, publishedAt, isSale }], multiNotifiedAt }
    products: {}
  };
}

function objectOr(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeState(state) {
  const base = createDefaultState();
  if (!state || typeof state !== "object") return base;
  return {
    ...base,
    ...state,
    searchedAt: objectOr(state.searchedAt),
    videos: objectOr(state.videos),
    products: objectOr(state.products)
  };
}

function createStore(dataDir) {
  const stateFile = path.join(dataDir, "gadget-watcher-state.json");

  async function read() {
    try {
      return normalizeState(JSON.parse(await fs.readFile(stateFile, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return createDefaultState();
      throw error;
    }
  }

  async function write(state) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmpFile = `${stateFile}.tmp`;
    await fs.writeFile(tmpFile, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
    await fs.rename(tmpFile, stateFile);
  }

  return { read, write, stateFile };
}

module.exports = { createStore };
