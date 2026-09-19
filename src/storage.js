const fs = require("fs/promises");
const path = require("path");

function createDefaultState() {
  return {
    version: 1,
    initializedAt: null,
    // GitHub に最後に書き込んだ内容のハッシュ（変化がなければ書き込まない）
    publishedHash: null,
    // videoId -> { channelId, title, publishedAt, checkedAt }
    videos: {},
    // ASIN -> { label, mentions: [{ channelId, channelName, videoId, publishedAt }], multiNotifiedAt }
    products: {}
  };
}

function normalizeState(state) {
  const base = createDefaultState();
  if (!state || typeof state !== "object") return base;
  return {
    ...base,
    ...state,
    videos: state.videos && typeof state.videos === "object" ? state.videos : {},
    products: state.products && typeof state.products === "object" ? state.products : {}
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
