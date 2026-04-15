const http = require("http");
const fs = require("fs");
const path = require("path");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 Internal Server Error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

function listenWithFallback(startPort, maxAttempts = 20) {
  let attempt = 0;
  let currentPort = startPort;
  let started = false;

  const tryListen = () => {
    server.listen(currentPort, HOST, () => {
      if (started) {
        return;
      }
      started = true;
      console.log(`BTC chart app running at http://localhost:${currentPort}`);
    });
  };

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < maxAttempts) {
      attempt += 1;
      currentPort += 1;
      console.warn(`Port in use. Trying http://localhost:${currentPort} ...`);
      server.close(() => {
        tryListen();
      });
      return;
    }

    throw error;
  });

  tryListen();
}

listenWithFallback(DEFAULT_PORT);
