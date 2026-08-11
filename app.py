#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
魔搭创空间（ModelScope Studio）Gradio SDK 入口
------------------------------------------------
魔搭 Gradio 模式会执行 `python3 app.py`，并探测 7860 端口上的 Gradio 应用。

本文件 = FastAPI + Gradio 组合：
- Gradio 挂载在 `/`：魔搭健康检查通过（gradio 页面 + /gradio_api 端点）
- 完整前端页面（CSS/JS 内联）通过 gr.HTML 嵌入 Gradio
- POST /api/generate-topics、/api/rewrite 由 FastAPI 提供（Python 实现）
- AI 引擎：环境变量 VC_LLM_API_KEY 存在则调 DeepSeek（OpenAI 兼容），否则返回 mock 数据
"""
import json
import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
PORT = int(os.environ.get("PORT") or os.environ.get("GRADIO_SERVER_PORT") or 7860)


def load_env():
    """轻量 .env 读取（与 server.js 一致）：仅当环境变量未设置时填充。"""
    try:
        txt = (BASE_DIR / ".env").read_text(encoding="utf-8")
        for line in txt.splitlines():
            m = re.match(r"^\s*([\w.-]+)\s*=\s*(.*)\s*$", line)
            if m and os.environ.get(m.group(1)) is None:
                os.environ[m.group(1)] = m.group(2).strip().strip("'\"")
    except OSError:
        pass


load_env()

# --------------------------------------------------------------------------
# AI 逻辑（Python 实现，与 src/ai.js 功能对齐）
# --------------------------------------------------------------------------
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
    req = __import__("urllib.request", fromlist=["Request"]).Request(
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
    with __import__("urllib.request", fromlist=["urlopen"]).urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def _parse_json(text):
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
        level, category, reason = "blocked", "违法违规(硬黑名单)", f"命中明确违规词：{hit}"
    else:
        category, reason = safety.get("category", ""), safety.get("reason", "")
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


# --------------------------------------------------------------------------
# 爆款仿写二创（Python 实现，与 Node 版 /api/rewrite 功能对齐）
# --------------------------------------------------------------------------
def _sanitize_rewrite(r):
    def s(v, d="—"):
        return v.strip() if isinstance(v, str) and v.strip() else d
    genes = r.get("genes", [])[:3] if isinstance(r.get("genes"), list) else []
    text = " ".join([s(r.get("topic")), s(r.get("draft")), s(r.get("angle_shift"))])
    safety = r.get("safety") if isinstance(r.get("safety"), dict) else {}
    level = safety.get("level") if safety.get("level") in ("safe", "caution", "blocked") else "safe"
    hit = next((w for w in HARD_BLOCK if w in text), None)
    if hit:
        level, category, reason = "blocked", "违法违规(硬黑名单)", f"命中明确违规词：{hit}"
    else:
        category, reason = safety.get("category", ""), safety.get("reason", "")
    return {
        "topic": s(r.get("topic")),
        "target_audience": s(r.get("target_audience")),
        "angle_shift": s(r.get("angle_shift")),
        "draft": s(r.get("draft")),
        "genes": genes,
        "safety": {"level": level, "category": category, "reason": reason},
    }


def _mock_rewrite(payload):
    bestseller = payload.get("bestseller_content", "")
    auds = payload.get("target_audiences") or ["学生党"]
    count = int(payload.get("count") or 3)
    aud = auds[0]
    m = re.search(r"[\u4e00-\u9fa5]{2,4}", bestseller)
    kw = m.group(0) if m else "爆款"
    source = {
        "summary": f"一条围绕「{kw}」的高互动爆款笔记（示例拆解）",
        "modules": [
            {"name": "开篇钩子", "role": "用强冲突/痛点抓住前 3 秒", "transferable": "任何品类都能用'你还在 X？'式反问"},
            {"name": "身份代入", "role": "圈定精准人群制造归属感", "transferable": "替换人群标签即可复用"},
            {"name": "干货清单", "role": "用编号罗列可操作要点", "transferable": "结构化清单收藏率高"},
        ],
        "mechanism": "强身份标签 + 可复制清单 + 反差画面，叠加'抄作业'式低门槛行动触发，天然高收藏转发",
    }
    bank = [
        {
            "topic": f"{aud}版「{kw}」照着做就对了",
            "target_audience": aud,
            "angle_shift": f"把原文人群换成{aud}，场景本地化",
            "draft": f"姐妹们！原文那套我给{aud}改了一版，亲测更顺手👇\n1. 先 XX 再 XX，别反了\n2. 预算控制在 XX 内，别被割\n3. 卡壳了就回到最基础的哪步\n评论区扣 1 发你同款清单～",
            "genes": ["身份标签", "行动触发"],
            "safety": {"level": "safe", "category": "", "reason": ""},
        },
        {
            "topic": f"别再盲目{kw}！{aud}的 3 个坑",
            "target_audience": aud,
            "angle_shift": "从'怎么做'切到'别踩坑'（避坑视角）",
            "draft": f"踩过才知道的坑！{aud}做{kw}最容易翻车的 3 个点：\n❌ 一上来就堆量\n❌ 跟风买贵的\n❌ 忽略自己的场景\n对应解法在图 2，存好别删～",
            "genes": ["情绪钩子", "信息差"],
            "safety": {"level": "safe", "category": "", "reason": ""},
        },
        {
            "topic": f"{kw}还能这样玩？{aud}反常识实测",
            "target_audience": aud,
            "angle_shift": "用反常识冲突制造好奇",
            "draft": f"都说{kw}要多做，我偏反着试了两周——结果真香？\n数据摆在这：少做这一步，效果反而 +30%\n原理其实很简单，看完你就懂为啥以前白忙活",
            "genes": ["反常识冲突", "信息差"],
            "safety": {"level": "safe", "category": "", "reason": ""},
        },
    ]
    return {
        "source": source,
        "rewrites": [dict(bank[i % len(bank)]) for i in range(count)],
    }


def _rewrite_bestseller(payload):
    if not os.environ.get("VC_LLM_API_KEY"):
        return {"model": "mock", **_mock_rewrite(payload)}
    bestseller = payload.get("bestseller_content", "")
    auds = "、".join(payload.get("target_audiences") or []) or "不限（由你推断合适人群）"
    count = int(payload.get("count") or 3)
    system = (
        "你是一位拥有5年小红书运营经验的爆款拆解与二创专家。"
        f"Step1 结构拆解：把原文拆成 4-6 个模块，每个含 name/role/transferable，并提炼 mechanism。"
        f"Step2 同风格二创：保留原文结构骨架与语气，替换人群/场景/素材，生成 {count} 个差异化新选题。"
        "每个二创含 topic/target_audience/angle_shift/draft(≤200字，带换行与emoji)/genes(2类)/safety{level,category,reason}。"
        "只输出纯 JSON 对象：{source:{summary,modules:[{name,role,transferable}],mechanism},rewrites:[...]}。"
        "红线：二创必须差异化不得照搬原文；禁用最/第一/绝对/国家级/唯一等绝对化表述；"
        "健康类弱化为个人经验分享，不承诺功效；不站队不蹭敏感话题。"
    )
    user = (
        f"# 爆款笔记内容\n\"\"\"\n{bestseller}\n\"\"\"\n"
        f"二创目标人群：{auds}\n二创数量：{count}\n请输出纯 JSON 对象。"
    )
    try:
        raw = _call_llm(system, user)
        data = _parse_json(raw)
        if not isinstance(data, dict) or not isinstance(data.get("rewrites"), list):
            raise ValueError("LLM 返回缺少 rewrites 数组")

        def s(v, d="—"):
            return v.strip() if isinstance(v, str) and v.strip() else d
        src = data.get("source") if isinstance(data.get("source"), dict) else {}
        raw_modules = src.get("modules") if isinstance(src.get("modules"), list) else []
        modules = []
        for m in raw_modules[:6]:
            if isinstance(m, dict):
                modules.append({"name": s(m.get("name")), "role": s(m.get("role")), "transferable": s(m.get("transferable"))})
        source = {"summary": s(src.get("summary")), "modules": modules, "mechanism": s(src.get("mechanism"))}
        rewrites = [_sanitize_rewrite(r) for r in data["rewrites"]]
        return {"model": os.environ.get("VC_LLM_MODEL", "deepseek-v4-flash"), "source": source, "rewrites": rewrites}
    except Exception as e:
        return {"model": "mock(fallback)", "note": f"真实模型调用失败，已降级示例：{e}", **_mock_rewrite(payload)}


def _public_file(filename):
    """返回 public/ 下的静态文件（前端页面 / CSS / JS）。"""
    fp = PUBLIC_DIR / filename
    if not fp.is_file():
        return JSONResponse({"ok": False, "error": "Not Found"}, status_code=404)
    return FileResponse(fp)


# --------------------------------------------------------------------------
# FastAPI + Gradio（魔搭 Gradio SDK 兼容）
# --------------------------------------------------------------------------
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
import gradio as gr

app = FastAPI(title="灵感炸了 · IdeaBoom")


@app.post("/api/generate-topics")
async def api_generate_topics(req: Request):
    try:
        payload = await req.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "请求体不是合法 JSON"}, status_code=400)
    if not payload.get("hotspot_summary", "").strip():
        return JSONResponse({"ok": False, "error": "缺少 hotspot_summary"}, status_code=400)
    return {"ok": True, **_generate_topics(payload)}


@app.post("/api/rewrite")
async def api_rewrite(req: Request):
    try:
        payload = await req.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "请求体不是合法 JSON"}, status_code=400)
    if not payload.get("bestseller_content", "").strip():
        return JSONResponse({"ok": False, "error": "缺少 bestseller_content"}, status_code=400)
    return {"ok": True, **_rewrite_bestseller(payload)}


# 前端页面（独立于 Gradio，iframe 内嵌，保证 JS 正常执行）
@app.get("/__app/")
async def frontend_index():
    return FileResponse(PUBLIC_DIR / "index.html")


@app.get("/__app/{filename}")
async def frontend_static(filename: str):
    return _public_file(filename)


# Gradio 主应用：挂载在 /，用 iframe 嵌入前端页面，满足魔搭 Gradio 健康检查
_GIO_CSS = """
.gradio-container { max-width: none !important; padding: 0 !important; margin: 0 !important; }
footer { display: none !important; }
html, body { margin: 0 !important; padding: 0 !important; }
"""

with gr.Blocks(title="灵感炸了 · IdeaBoom") as _demo:
    gr.HTML(
        '<iframe src="/__app/" style="width:100%;height:100vh;border:0;display:block"></iframe>',
        elem_id="_gio_frontend",
    )

app = gr.mount_gradio_app(app, _demo, path="/", css=_GIO_CSS)


def main():
    import uvicorn
    print(f"[app.py] 灵感炸了已启动: http://0.0.0.0:{PORT}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()


