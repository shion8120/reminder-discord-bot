const DESCRIPTION_LIMIT = 3800;

function chunkLines(lines) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > DESCRIPTION_LIMIT) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n" : ""}${line}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function postWebhook(webhookUrl, payload) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload })
    });
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      await new Promise((resolve) => setTimeout(resolve, Math.ceil((body.retry_after || 2) * 1000)));
      continue;
    }
    if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}: ${await response.text()}`);
    return;
  }
  throw new Error("Discord webhook: rate limited");
}

function createNotifier(webhookUrl) {
  async function send({ title, url, color, lines }) {
    const chunks = chunkLines(lines.length ? lines : ["（Amazonの商品リンクなし）"]);
    for (const [index, description] of chunks.entries()) {
      const embed = {
        title: index === 0 ? title.slice(0, 256) : `${title.slice(0, 240)}（続き）`,
        url,
        color,
        description
      };
      if (!webhookUrl) {
        console.log(`\n=== ${embed.title}\n${url}\n${description}`);
        continue;
      }
      await postWebhook(webhookUrl, { embeds: [embed] });
    }
  }
  return { send };
}

module.exports = { createNotifier };
