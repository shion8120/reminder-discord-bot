const http = require("http");

// 収集結果を読み取り専用で公開する。中身は YouTube の公開情報と ASIN だけ
function startServer(port, getFeed) {
  const routes = {
    "/": ["text/markdown; charset=utf-8", (feed) => feed.markdown],
    "/youtuber-pool.md": ["text/markdown; charset=utf-8", (feed) => feed.markdown],
    "/youtuber-pool.json": ["application/json; charset=utf-8", (feed) => feed.json],
    "/healthz": ["text/plain; charset=utf-8", () => "ok\n"]
  };

  const server = http.createServer((request, response) => {
    const route = routes[new URL(request.url, "http://localhost").pathname];
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    if (!route) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found\n");
      return;
    }
    const [type, render] = route;
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : render(getFeed()));
  });

  server.listen(port, () => console.log(`HTTP: ポート ${port} で公開中`));
  return server;
}

module.exports = { startServer };
