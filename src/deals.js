// Amazonのセール情報を1日2回見に行き、ガジェット系の候補をプールに足す。
// Amazon はデータセンターからのアクセスを弾くことがあるので、失敗しても全体は止めない。
const { classifyProduct } = require("./classify");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const DEAL_PAGES = [
  "https://www.amazon.co.jp/gp/goldbox",
  "https://www.amazon.co.jp/deals",
  // ガジェット寄りの候補を増やすための急上昇ランキング
  "https://www.amazon.co.jp/gp/movers-and-shakers/computers/",
  "https://www.amazon.co.jp/gp/movers-and-shakers/electronics/"
];
const MAX_DEALS = 25;
const FETCH_DELAY_MS = 2500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function looksBlocked(html) {
  return (
    /api-services-support@amazon\.com/i.test(html) ||
    /To discuss automated access/i.test(html) ||
    /captcha/i.test(html) ||
    html.length < 20000
  );
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8", Accept: "text/html" },
    // 応答が返らないと処理全体が止まるので、必ず時間で打ち切る
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// 商品ページから、商品名と価格を読む
function parseProduct(html) {
  const title =
    html.match(/<span[^>]+id="productTitle"[^>]*>([^<]+)</)?.[1]?.trim() ||
    html.match(/"title"\s*:\s*"([^"]{5,120})"/)?.[1];
  // ポイント数や分割払いの金額を拾わないよう、価格表示のブロックの中だけを見る
  const coreBlock =
    html.match(/id="corePriceDisplay[\s\S]{0,4000}/)?.[0] ||
    html.match(/id="corePrice_feature_div[\s\S]{0,4000}/)?.[0] ||
    "";
  const fromBlock = [
    ...[...coreBlock.matchAll(/class="a-offscreen">[￥¥]([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ""))),
    ...[...coreBlock.matchAll(/"priceAmount"\s*:\s*([\d.]+)/g)].map((m) => Number(m[1]))
  ].filter((value) => Number.isFinite(value) && value >= 100);

  const fromJson = Number(html.match(/"displayPrice"\s*:\s*"[￥¥]([\d,]+)"/)?.[1]?.replace(/,/g, ""));

  // 最後の手段：ページ全体でいちばん多く出てくる金額を採る（端数の小物価格を拾わないため）
  const counts = new Map();
  for (const match of html.matchAll(/class="a-offscreen">[￥¥]([\d,]+)/g)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 500) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];

  const price = fromBlock[0] || (Number.isFinite(fromJson) && fromJson >= 100 ? fromJson : null) || mostCommon || null;
  return { title: title || "", price: price ? Math.round(price) : null };
}

// セール一覧から ASIN を拾う
async function listDealAsins() {
  const found = new Set();
  const notes = [];
  for (const url of DEAL_PAGES) {
    try {
      const html = await fetchPage(url);
      if (looksBlocked(html)) {
        notes.push(`${url}: 弾かれた`);
        continue;
      }
      for (const match of html.matchAll(/\/dp\/([A-Z0-9]{10})/g)) found.add(match[1]);
      notes.push(`${url}: ${found.size}件`);
    } catch (error) {
      notes.push(`${url}: ${error.message}`);
    }
    await sleep(FETCH_DELAY_MS);
  }
  return { asins: [...found].slice(0, MAX_DEALS), notes };
}

// 収集済みの商品の「今の価格」を見に行く（セール中かどうかの判断材料になる）
async function checkKnownPrices(state, limit = 15) {
  const targets = Object.entries(state.products)
    .filter(([, product]) => ["gadget", "appliance"].includes(product.category))
    .sort((a, b) => (a[1].priceCheckedAt || "").localeCompare(b[1].priceCheckedAt || ""))
    .slice(0, limit);

  let updated = 0;
  let blocked = 0;
  for (const [asin, product] of targets) {
    try {
      const html = await fetchPage(`https://www.amazon.co.jp/dp/${asin}`);
      if (looksBlocked(html)) {
        blocked += 1;
        if (blocked >= 3) break;
        continue;
      }
      const { price } = parseProduct(html);
      product.priceCheckedAt = new Date().toISOString();
      if (price) {
        product.priceLog = [...(product.priceLog || []), { date: new Date().toISOString().slice(0, 10), price }].slice(-30);
        product.lastPrice = price;
        updated += 1;
      }
    } catch {
      // 1件の失敗は無視する
    }
    await sleep(FETCH_DELAY_MS);
  }
  return { updated, blocked, checked: targets.length };
}

async function collectDeals(state) {
  const { asins, notes } = await listDealAsins();
  let added = 0;

  for (const asin of asins) {
    if (state.deals?.[asin]) continue;
    let html;
    try {
      html = await fetchPage(`https://www.amazon.co.jp/dp/${asin}`);
    } catch {
      continue;
    }
    await sleep(FETCH_DELAY_MS);
    if (looksBlocked(html)) break;

    const { title, price } = parseProduct(html);
    const category = classifyProduct(title);
    // セール候補はガジェットだけにする（炊飯器などの生活家電は記事の対象外）
    if (category !== "gadget") continue;

    state.deals ||= {};
    state.deals[asin] = { title, price, category, seenAt: new Date().toISOString(), source: "amazon-deals" };
    added += 1;
  }
  return { added, notes, candidates: asins.length };
}

// JSTの指定時刻（既定 8時・20時）を過ぎていたら実行する
function shouldRun(state, hours, now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const slot = [...hours].reverse().find((hour) => jst.getUTCHours() >= hour);
  if (slot === undefined) return null;
  const key = `${jst.toISOString().slice(0, 10)}-${slot}`;
  return state.dealsRunKey === key ? null : key;
}

async function maybeCheckDeals(state, config) {
  // 価格の読み方を直したので、古い収集結果は一度捨てる
  if (state.dealsSchema !== 4) {
    state.deals = {};
    state.dealsRunKey = null;
    state.dealsSchema = 4;
  }

  const key = shouldRun(state, config.dealHours);
  if (!key) return;

  console.log(`Amazonセール確認を開始 (${key})`);
  try {
    const deals = await collectDeals(state);
    console.log(`セール候補: 新規 ${deals.added}件 / 取得 ${deals.candidates}件 ${deals.notes.join(" / ")}`);
  } catch (error) {
    console.warn(`セール一覧: ${error.message}`);
  }
  try {
    const prices = await checkKnownPrices(state);
    console.log(`価格確認: ${prices.updated}/${prices.checked}件 更新（弾かれ ${prices.blocked}件）`);
  } catch (error) {
    console.warn(`価格確認: ${error.message}`);
  }
  state.dealsRunKey = key;
  state.dealsCheckedAt = new Date().toISOString();
}

module.exports = { maybeCheckDeals, shouldRun, parseProduct };
