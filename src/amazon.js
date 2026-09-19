// 概要欄の Amazon リンクから ASIN だけを取り出す。
// 他人のアフィリエイトタグ（tag=... / amzlink.to / amzn.to）は絶対に残さない。
const LINK_PATTERN =
  /https?:\/\/(?:www\.)?(?:amazon\.co\.jp|amzn\.to|amzn\.asia|amzlink\.to|a\.co)\/[^\s]*/gi;
const ASIN_PATTERN = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/exec\/obidos\/ASIN\/|\/o\/ASIN\/)([A-Z0-9]{10})(?=[/?&#%]|$)/;
const MAX_REDIRECTS = 5;

const resolved = new Map();

function fullyDecode(text) {
  let current = text;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function findAsin(url) {
  return fullyDecode(url).match(ASIN_PATTERN)?.[1] || null;
}

async function resolveAsin(url) {
  if (resolved.has(url)) return resolved.get(url);

  let asin = findAsin(url);
  let current = url;
  for (let hop = 0; !asin && hop < MAX_REDIRECTS; hop += 1) {
    let response;
    try {
      response = await fetch(current, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    } catch {
      break;
    }
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current).toString();
    asin = findAsin(current);
  }

  resolved.set(url, asin);
  return asin;
}

function cleanLabel(text) {
  return text
    .replace(LINK_PATTERN, "")
    .replace(/^[\s・▼▶►●■□◆◇★☆※\-–—:：|｜>＞]+/, "")
    .replace(/[\s:：\-–—|｜]+$/, "")
    .trim()
    .slice(0, 80);
}

// [{ label, asin, url }]  url はタグなしの商品ページ。まとめリスト等（ASINなし）は除外
async function extractProducts(description) {
  const lines = (description || "").split("\n");
  const products = [];
  const seen = new Set();
  let previousText = "";

  for (const line of lines) {
    const links = line.match(LINK_PATTERN) || [];
    if (!links.length) {
      if (line.trim()) previousText = line;
      continue;
    }
    const label = cleanLabel(line) || cleanLabel(previousText);
    for (const link of links) {
      const asin = await resolveAsin(link);
      if (!asin || seen.has(asin)) continue;
      seen.add(asin);
      products.push({ label, asin, url: `https://www.amazon.co.jp/dp/${asin}` });
    }
  }
  return products;
}

module.exports = { extractProducts, findAsin };
