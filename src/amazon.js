// 概要欄の Amazon リンクから ASIN だけを取り出す。
// 他人のアフィリエイトタグ（tag=... / amzlink.to / amzn.to）は絶対に残さない。
const { classifyProduct } = require("./classify");

const LINK_PATTERN =
  /https?:\/\/(?:www\.)?(?:amazon\.co\.jp|amzn\.to|amzn\.asia|amzlink\.to|a\.co)\/[^\s]*/gi;
const ANY_URL = /https?:\/\/[^\s]+/gi;
const ASIN_PATTERN = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/exec\/obidos\/ASIN\/|\/o\/ASIN\/)([A-Z0-9]{10})(?=[/?&#%]|$)/;
const MAX_REDIRECTS = 5;
const REDIRECT_DELAY_MS = 150;

// 見出し行（【…】 ▼… ■… 〇… など）で区切られた節のうち、
// 投稿者の常用機材・撮影機材の節は「その動画で紹介した商品」ではないので捨てる
const HEADER_PATTERN = /^\s*(【.*】|[▼▽▶►■□◆◇●○〇★☆◎].*|.*[:：]\s*)$/;
const EQUIPMENT_SECTION = /使用機材|撮影機材|機材一覧|撮影環境|編集環境|愛用品|愛用している|普段使って|お気に入り(の|な)?(ガジェット|機材|PC周辺)|デスク(環境|ツアー)の商品|BGM|音楽|効果音|素材|お仕事|依頼|メンバーシップ|グッズ|スタンプ|SNS|Twitter|Instagram|TikTok/i;

const STORE_ONLY = /^(Amazon|アマゾン|amazon\.co\.jp|楽天|楽天市場|Yahoo!?|ヤフー|公式|公式ストア|購入|購入はこちら|こちら|リンク|商品ページ)$/i;

const resolved = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      await sleep(REDIRECT_DELAY_MS);
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
    .replace(ANY_URL, "")
    // 「(7/12 追記 在庫切れ…)」のような注記は外す
    .replace(/[（(][^()（）]*(追記|在庫|投稿時点|売り切れ|※)[^()（）]*[)）]/g, "")
    .replace(/[（(]※.*$/, "")
    .replace(/^[\s・▼▶►●■□◆◇★☆※\-–—:：|｜>＞\d０-９.．、①-⑳]+/, "")
    .replace(/[\s:：\-–—|｜→⇒]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// [{ label, asin, url, category }]
//   url はタグなしの商品ページ。ASINのないリンク（まとめリスト・キャンペーン）と、
//   関係ない商品（classifyProduct が null）は含めない
async function extractProducts(description) {
  const lines = (description || "").split("\n");
  const products = [];
  const seen = new Set();
  let previousText = "";
  let skipSection = false;

  for (const line of lines) {
    const links = line.match(LINK_PATTERN) || [];
    const hasAnyUrl = ANY_URL.test(line);
    ANY_URL.lastIndex = 0;

    if (!hasAnyUrl) {
      if (HEADER_PATTERN.test(line)) {
        skipSection = EQUIPMENT_SECTION.test(line);
        previousText = "";
      } else if (line.trim()) {
        previousText = line;
      }
      continue;
    }
    if (skipSection || !links.length) continue;

    // 「白→ URL」「Amazon: URL」のような短い・店名だけのラベルは、直前の商品名とつなげる
    let label = cleanLabel(line);
    if (label.length < 4 || STORE_ONLY.test(label)) {
      label = [cleanLabel(previousText), STORE_ONLY.test(label) ? "" : label].filter(Boolean).join(" ");
    }
    const category = classifyProduct(label);
    if (!category) continue;

    for (const link of links) {
      const asin = await resolveAsin(link);
      if (!asin || seen.has(asin)) continue;
      seen.add(asin);
      products.push({ label, asin, category, url: `https://www.amazon.co.jp/dp/${asin}` });
    }
  }
  return products;
}

module.exports = { extractProducts, findAsin, cleanLabel };
