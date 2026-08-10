#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
魔搭创空间（ModelScope Studio）Gradio 模式入口
------------------------------------------------
魔搭 Gradio SDK 会以 `python3 app.py` 启动应用并轮询 7860 端口。

本文件策略：
1. 优先启动 Node 版「灵感炸了」服务（server.js，完整功能：选题 + 仿写二创 + DeepSeek）。
2. 若环境缺少 Node，则降级为 Python 内置 http.server 实现：
   - 静态托管 public/
   - POST /api/generate-topics：读环境变量调 DeepSeek，未配置则返回示例数据。
"""
import json
import os
import shutil
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
PORT = int(os.environ.get("PORT") or os.environ.get("GRADIO_SERVER_PORT") or 7860)


def node_available():
    return shutil.which("node") is not None


def _port_open(port, timeout=1.0):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def start_node():
    """启动 server.js，等待端口就绪；失败返回 None。"""
    env = dict(os.environ)
    env.setdefault("PORT", str(PORT))
    proc = subprocess.Popen(
        ["node", "server.js"],
        cwd=BASE_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 30
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        if _port_open(PORT):
            return proc
        time.sleep(0.5)
    proc.terminate()
    return None

# --------------------------------------------------------------------------
# Python 降级：静态托管 + 极简 AI API
# --------------------------------------------------------------------------
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

HARD_BLOCK = ["冰毒", "海洛因", "摇头丸", "赌博", "博彩", "私彩", "代孕", "枪支"]


def _mock_topics(payload):
    audiences = payload.get("audiences") or ["通用"]
    count = int(payload.get("count") or 5)
    aud = audiences[0]
    bank = [
        {
            "topic": f"{aud}别再盲试热点！这3步才不翻车",
            "title": f"{aud}的热点避坑指南",
            "angle": "从盲目跟风切到可复制的安全路径，用步骤感降低焦虑",
            "anchor": "一张「翻车 vs 安全」对比卡，红绿配色强烈",
            "anchor_reason": "对比画面天然适合截图收藏，解决「我是不是也踩了」的焦虑",
            "genes": ["情绪钩子", "身份标签"],
            "hit_reason": "呼应热点报告中的高频踩坑痛点",
            "score": {"click": 5, "spread": 4, "exec": 4, "total": 13},
            "edge": False,
            "safety": {"level": "safe", "category": "", "reason": ""},
        },
        {
            "topic": f"90%的{aud}都不知道热点的正确打开方式",
            "title": "关于热点，你可能一直做错了",
            "angle": "用信息差制造「原来如此」的顿悟感",
            "anchor": "一句扎心金句：你省下的时间，都花在了内耗上",
            "anchor_reason": "金句易截图传播，戳中共鸣",
            "genes": ["信息差", "情绪钩子"],
            "hit_reason": "填补报告中的认知缺口",
            "score": {"click": 4, "spread": 5, "exec": 4, "total": 13},
            "edge": False,
            "safety": {"level": "safe", "category": "", "reason": ""},
        },
    ]
    return [dict(bank[i % len(bank)]) for i in range(count)]


def _call_llm(system, user):
    base = os.environ.get("VC_LLM_BASE", "https://api.deepseek.com/v1").rstrip("/")
    model = os.environ.get("VC_LLM_MODEL", "deepseek-v4-flash")
    key = os.environ.get("VC_LLM_API_KEY", "")
    req = Request(
        f"{base}/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.85,
        }).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]

def _parse_json(text):
    import re
    t = text.strip()
    for pre in ("```json", "```"):
        if t.startswith(pre):
            t = t[len(pre):]
    if t.endswith("```"):
        t = t[:-3]
    t = t.strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    m = re.search(r"\[[\s\S]*\]", t) or re.search(r"\{[\s\S]*\}", t)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    raise ValueError("LLM 返回无法解析为 JSON")


def _sanitize_topic(t):
    def s(v, d="—"):
        return v.strip() if isinstance(v, str) and v.strip() else d
    genes = t.get("genes", [])[:3] if isinstance(t.get("genes"), list) else []
    sc = t.get("score") if isinstance(t.get("score"), dict) else {}
    click = int(sc.get("click") or 0)
    spread = int(sc.get("spread") or 0)
    exec_ = int(sc.get("exec") or 0)
    total = int(sc.get("total") or (click + spread + exec_))
    text = " ".join([s(t.get("topic")), s(t.get("title")), s(t.get("angle")), s(t.get("anchor"))])
    safety = t.get("safety") if isinstance(t.get("safety"), dict) else {}
    level = safety.get("level") if safety.get("level") in ("safe", "caution", "blocked") else "safe"
    hit = next((w for w in HARD_BLOCK if w in text), None)
    if hit:
        level = "blocked"
        category = "违法违规(硬黑名单)"
        reason = f"命中明确违规词：{hit}"
    else:
        category = safety.get("category", "")
        reason = safety.get("reason", "")
    return {
        "topic": s(t.get("topic")),
        "title": s(t.get("title")),
        "angle": s(t.get("angle")),
        "anchor": s(t.get("anchor")),
        "anchor_reason": s(t.get("anchor_reason")),
        "genes": genes,
        "hit_reason": s(t.get("hit_reason")),
        "score": {"click": click, "spread": spread, "exec": exec_, "total": total},
        "edge": total < 10,
        "safety": {"level": level, "category": category, "reason": reason},
    }


def _generate_topics(payload):
    if not os.environ.get("VC_LLM_API_KEY"):
        return {"model": "mock", "topics": _mock_topics(payload)}
    hotspot = payload.get("hotspot_summary", "")
    types = "、".join(payload.get("content_types") or []) or "不限"
    auds = "、".join(payload.get("audiences") or []) or "通用"
    count = int(payload.get("count") or 5)
    system = (
        "你是一位拥有5年小红书运营经验的爆款选题策划专家。严格按 5 步流水线："
        "Step1 痛点挖掘 → Step2 角度嫁接（冲突/反常识）→ Step3 传播锚点设计 → Step4 爆款基因植入（至少2类）→ Step5 质量门自评。"
        "每条必须返回 JSON：topic/title/angle/anchor/anchor_reason/genes/hit_reason/score{click,spread,exec,total}/edge/safety{level,category,reason}。"
        "总分满分15，<10 标 edge:true。只输出纯 JSON 数组，不要 markdown 代码块。"
        "红线：禁用最/第一/绝对/国家级/唯一等绝对化表述；健康类弱化为个人经验分享，不承诺功效；不站队不蹭敏感话题；不编造数据。"
    )
    user = (
        f"# 热点报告\n\"\"\"\n{hotspot}\n\"\"\"\n"
        f"内容类型：{types}\n目标受众：{auds}\n数量：{count}\n请输出 {count} 条高潜选题的纯 JSON 数组。"
    )
    try:
        raw = _call_llm(system, user)
        topics = _parse_json(raw)
        if not isinstance(topics, list):
            raise ValueError("LLM 返回非数组")
        topics = [_sanitize_topic(t) for t in topics]
        topics.sort(key=lambda x: x["score"]["total"], reverse=True)
        return {"model": os.environ.get("VC_LLM_MODEL", "deepseek-v4-flash"), "topics": topics}
    except Exception as e:
        return {"model": "mock(fallback)", "note": f"真实模型调用失败，已降级示例：{e}", "topics": _mock_topics(payload)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send(self, code, obj, ctype="application/json; charset=utf-8"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        from urllib.parse import urlparse
        path = urlparse(self.path).path
        if path in ("/", ""):
            path = "/index.html"
        fp = os.path.join(PUBLIC_DIR, path.lstrip("/"))
        if not os.path.realpath(fp).startswith(os.path.realpath(PUBLIC_DIR)) or not os.path.isfile(fp):
            self._send(404, {"ok": False, "error": "Not Found"})
            return
        ext = os.path.splitext(fp)[1].lower()
        with open(fp, "rb") as f:
            self._send(200, f.read(), MIME.get(ext, "application/octet-stream"))

    def do_POST(self):
        from urllib.parse import urlparse
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception:
            self._send(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return
        if path == "/api/generate-topics":
            if not payload.get("hotspot_summary", "").strip():
                self._send(400, {"ok": False, "error": "缺少 hotspot_summary"})
                return
            self._send(200, {"ok": True, **_generate_topics(payload)})
            return
        self._send(404, {"ok": False, "error": "Not Found"})


def serve_fallback():
    print(f"[app.py] Node 不可用，降级为 Python 服务，端口 {PORT}（功能受限）", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


def main():
    if node_available():
        proc = start_node()
        if proc is not None:
            print(f"[app.py] Node 服务已启动: http://127.0.0.1:{PORT} (PID {proc.pid})", flush=True)
            try:
                while proc.poll() is None:
                    time.sleep(5)
            finally:
                proc.terminate()
            return
        print("[app.py] 启动 Node 失败，尝试 Python 降级", flush=True)
    serve_fallback()


if __name__ == "__main__":
    main()

