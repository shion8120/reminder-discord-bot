// 収集結果を GitHub リポジトリのファイルとして書き込む（Contents API）。
// 記事を書く側（Claude）はこのファイルを読むだけでよい。
const API = "https://api.github.com";

function createPublisher({ token, repo, branch }) {
  if (!token || !repo) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gadget-watcher"
  };

  async function getSha(filePath) {
    const response = await fetch(
      `${API}/repos/${repo}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub GET ${filePath}: HTTP ${response.status}`);
    return (await response.json()).sha;
  }

  async function putFile(filePath, content, message) {
    const sha = await getSha(filePath);
    const response = await fetch(`${API}/repos/${repo}/contents/${encodeURI(filePath)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message,
        branch,
        content: Buffer.from(content, "utf8").toString("base64"),
        ...(sha ? { sha } : {})
      })
    });
    if (!response.ok) throw new Error(`GitHub PUT ${filePath}: HTTP ${response.status} ${await response.text()}`);
  }

  return { putFile, target: `${repo}@${branch}` };
}

module.exports = { createPublisher };
