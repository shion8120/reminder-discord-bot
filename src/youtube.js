const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const MAX_VIDEOS = 15;
// 動画タブの初期HTMLに入っている分（約30本）を全部使う
const PAGE_VIDEOS = 30;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

function decodeJsonString(raw) {
  return JSON.parse(`"${raw}"`);
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// 1. YouTube Data API（キーがあるとき）: アップロード再生リストを1回読むだけで概要欄まで取れる
async function listViaApi(channel, apiKey) {
  const playlistId = `UU${channel.channelId.slice(2)}`;
  const url =
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet" +
    `&maxResults=${MAX_VIDEOS}&playlistId=${playlistId}&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube API HTTP ${response.status}`);
  const data = await response.json();
  return (data.items || []).map((item) => ({
    videoId: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description
  }));
}

// 2. RSS: 404/500 がよく出るので失敗前提
async function listViaRss(channel) {
  const xml = await fetchText(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`
  );
  // <title> はチャンネル名も拾って1件ずれるので、entry ごとに切ってから読む
  return xml
    .split("<entry>")
    .slice(1)
    .slice(0, MAX_VIDEOS)
    .map((entry) => ({
      videoId: entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
      title: decodeXml(entry.match(/<media:title>([^<]*)<\/media:title>/)?.[1] || ""),
      publishedAt: entry.match(/<published>([^<]+)<\/published>/)?.[1] || null
    }))
    .filter((video) => video.videoId);
}

// 3. チャンネルの動画タブ: 新しい順に videoId が並ぶ（日付は取れない）
async function listViaChannelPage(channel) {
  const html = await fetchText(`https://www.youtube.com/@${channel.handle}/videos`);
  const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))];
  return ids.slice(0, PAGE_VIDEOS).map((videoId) => ({ videoId }));
}

// チャンネル内検索: 動画タブ（新しい約30本）より古いセール動画を拾うのに使う
async function searchChannel(channel, query) {
  const html = await fetchText(
    `https://www.youtube.com/@${channel.handle}/search?query=${encodeURIComponent(query)}`
  );
  const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))];
  return ids.map((videoId) => ({ videoId }));
}

async function listRecentVideos(channel, apiKey) {
  const sources = [];
  if (apiKey) sources.push(["api", () => listViaApi(channel, apiKey)]);
  sources.push(["rss", () => listViaRss(channel)], ["page", () => listViaChannelPage(channel)]);

  const errors = [];
  for (const [name, load] of sources) {
    try {
      const videos = await load();
      if (videos.length) return { source: name, videos };
      errors.push(`${name}: empty`);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  throw new Error(`${channel.name} の動画一覧を取得できません (${errors.join(" / ")})`);
}

async function detailsFromWatchPage(videoId) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  const description = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  const title = html.match(/"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/)?.[1];
  if (description === undefined) throw new Error("watch: 概要欄なし（ロボット確認ページの可能性）");
  return {
    title: title ? decodeJsonString(title) : "",
    description: decodeJsonString(description),
    publishedAt: html.match(/"publishDate":"([^"]+)"/)?.[1] || null,
    channelId: html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] || null
  };
}

async function postInnertube(endpoint, client, videoId) {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ context: { client: { ...client, hl: "ja", gl: "JP" } }, videoId })
  });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  return response.json();
}

function findDeep(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    const found = findDeep(value, predicate);
    if (found) return found;
  }
  return null;
}

// /next（WEB）: 動画ページの右側・下側の情報。watch ページが弾かれても通ることが多い
async function detailsFromNext(videoId) {
  const data = await postInnertube("next", { clientName: "WEB", clientVersion: "2.20260915.01.00" }, videoId);
  const primary = findDeep(data, (node) => node.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
  const secondary = findDeep(data, (node) => node.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
  const description = secondary?.attributedDescription?.content;
  if (description === undefined) throw new Error("next: 概要欄なし");
  const date = primary?.dateText?.simpleText?.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return {
    title: (primary?.title?.runs || []).map((run) => run.text).join(""),
    description,
    publishedAt: date ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}T00:00:00+09:00` : null,
    channelId: secondary?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || null
  };
}

// /player（ANDROID）: 最後の手段
async function detailsFromPlayerAs(videoId, client) {
  const data = await postInnertube("player", client, videoId);
  const details = data.videoDetails;
  if (details?.shortDescription === undefined) throw new Error(`player: ${data.playabilityStatus?.status || "概要欄なし"}`);
  return {
    title: details.title || "",
    description: details.shortDescription,
    publishedAt: null,
    channelId: details.channelId || null
  };
}

async function fetchVideoDetails(videoId) {
  const errors = [];
  const loaders = [
    detailsFromWatchPage,
    detailsFromNext,
    (id) => detailsFromPlayerAs(id, { clientName: "ANDROID", clientVersion: "20.10.38" }),
    (id) => detailsFromPlayerAs(id, { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2" }),
    (id) => detailsFromPlayerAs(id, { clientName: "MWEB", clientVersion: "2.20260915.01.00" }),
    (id) => detailsFromPlayerAs(id, { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" })
  ];
  for (const load of loaders) {
    try {
      return await load(videoId);
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`概要欄を読めません: ${videoId} (${errors.join(" / ")})`);
}

// API で取れなかった項目（概要欄・日付）を動画ページで補う
async function completeVideo(video) {
  if (video.description !== undefined && video.publishedAt) return video;
  const details = await fetchVideoDetails(video.videoId);
  return {
    ...video,
    title: video.title || details.title,
    description: video.description ?? details.description,
    publishedAt: video.publishedAt || details.publishedAt,
    // 検索結果には他チャンネルの動画も混ざるので、投稿者は動画側の情報を正とする
    channelId: details.channelId || video.channelId || null
  };
}

module.exports = { listRecentVideos, searchChannel, completeVideo };
