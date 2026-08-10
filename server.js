// server.js
// 纯 node http：静态托管 public/ + POST /api/generate-topics + POST /api/rewrite
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateTopics, rewriteBestseller } from "./src/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");

// 轻量 .env 读取：后台模式下外部环境变量常被剥离，改为进程内自读。
// 仅当对应变量未设置时才填充，便于外部 env 覆盖（优先级更高）。
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const k = m[1];
      const v = m[2].replace(/^["']|["']$/g, "");
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* 无 .env 则走 mock */
  }
}
loadEnv();
const PORT = process.env.PORT || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(PUBLIC, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC)) {
    return sendJSON(res, 403, { ok: false, error: "forbidden" });
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/generate-topics") {
    try {
      const payload = await readBody(req);
      if (!payload.hotspot_summary || !payload.hotspot_summary.trim()) {
        return sendJSON(res, 400, { ok: false, error: "缺少 hotspot_summary" });
      }
      const result = await generateTopics(payload);
      return sendJSON(res, 200, { ok: true, ...result });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  if (req.method === "POST" && req.url === "/api/rewrite") {
    try {
      const payload = await readBody(req);
      if (!payload.bestseller_content || !payload.bestseller_content.trim()) {
        return sendJSON(res, 400, { ok: false, error: "缺少 bestseller_content" });
      }
      const result = await rewriteBestseller(payload);
      return sendJSON(res, 200, { ok: true, ...result });
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: e.message });
    }
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`灵感炸了 · 创作工作台 已启动: http://localhost:${PORT}`);
  console.log(`AI 模式: ${process.env.VC_LLM_API_KEY ? "真实模型(" + (process.env.VC_LLM_MODEL || "gpt-4o-mini") + ")" : "mock（未配置 VC_LLM_API_KEY）"}`);
});
