// src/ai.js
// 选题 + 仿写二创：有 API key 走真实 LLM（OpenAI 兼容），否则走 mock。
import { buildPrompt, buildRewritePrompt } from "./prompt.js";

// 极小硬黑名单（防御性兜底，仅含明确违法/违规词，命中即 blocked）
// 色情/暴力/政治等语境相关风险主要交给模型语义自检（safety 字段），此处只兜明显漏判。
const HARD_BLOCK = ["冰毒", "海洛因", "摇头丸", "赌博", "博彩", "私彩", "代孕", "枪支"];

// ---------- 通用 LLM 调用 + JSON 解析 ----------
async function callLLM(system, user) {
  // 默认对接 DeepSeek（与 Python 版 app.py 一致）；如换其他 OpenAI 兼容服务，用 VC_LLM_BASE/VC_LLM_MODEL 覆盖
  const base = process.env.VC_LLM_BASE || "https://api.deepseek.com/v1";
  const model = process.env.VC_LLM_MODEL || "deepseek-v4-flash";
  const key = process.env.VC_LLM_API_KEY;
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.85,
    }),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return parseJSON(content);
}

function parseJSON(content) {
  const txt = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(txt);
  } catch {
    /* fallthrough */
  }
  const arr = txt.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      return JSON.parse(arr[0]);
    } catch {
      /* fallthrough */
    }
  }
  const obj = txt.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* fallthrough */
    }
  }
  throw new Error("LLM 返回无法解析为 JSON");
}

// ---------- 敏感信息判定 ----------
// 主逻辑：模型自检 safety={level,category,reason}（语义判定）
// 兜底：命中 HARD_BLOCK 明确违法词，强制 blocked
function computeSafety(raw, text) {
  const s = raw?.safety && typeof raw.safety === "object" ? raw.safety : {};
  let level = ["safe", "caution", "blocked"].includes(s.level) ? s.level : "safe";
  let category = typeof s.category === "string" ? s.category : "";
  let reason = typeof s.reason === "string" ? s.reason : "";
  const hit = HARD_BLOCK.find((w) => text.includes(w));
  if (hit) {
    level = "blocked";
    category = category || "违法违规(硬黑名单)";
    reason = reason || `命中明确违法/违规词：${hit}`;
  }
  return { level, category, reason };
}

// ---------- 选题：清洗 ----------
function sanitizeTopic(t) {
  const safe = (v, d = "—") =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const genes = Array.isArray(t?.genes) ? t.genes.slice(0, 3) : [];
  const score = t?.score && typeof t.score === "object" ? t.score : {};
  const click = Number(score.click) || 0;
  const spread = Number(score.spread) || 0;
  const exec = Number(score.exec) || 0;
  const total = Number(score.total) || click + spread + exec;
  const text = [t?.topic, t?.title, t?.angle, t?.anchor].join(" ");
  return {
    topic: safe(t?.topic),
    title: safe(t?.title),
    angle: safe(t?.angle),
    anchor: safe(t?.anchor),
    anchor_reason: safe(t?.anchor_reason),
    genes,
    hit_reason: safe(t?.hit_reason),
    score: { click, spread, exec, total },
    edge: total < 10,
    safety: computeSafety(t, text),
  };
}

function sortAndClean(topics) {
  const arr = Array.isArray(topics) ? topics : [];
  return arr.map(sanitizeTopic).sort((a, b) => b.score.total - a.score.total);
}

// ---------- 选题：Mock ----------
function mockTopics(payload) {
  const {
    hotspot_summary = "",
    content_types = ["干货教程"],
    audiences = ["通用"],
    count = 5,
  } = payload || {};
  const firstAud = audiences[0] || "通用";
  const firstType = content_types[0] || "干货教程";
  const KW_LIB = ["早C晚A", "通勤", "租房", "健身", "护肤", "种草", "考研", "带饭", "穿搭", "减脂", "副业", "露营", "备考", "护发", "育儿"];
  const kw = KW_LIB.find((k) => hotspot_summary.includes(k)) ||
    (hotspot_summary.match(/[#＃]?([\u4e00-\u9fa5]{2,4})/)?.[1]) || "热点";
  const bank = [
    {
      topic: `${firstAud}别再盲试${kw}！这3步才不翻车`,
      title: `${firstAud}的${kw}避坑指南`,
      angle: `从"盲目跟风"切到"可复制的安全路径"，用步骤感降低焦虑`,
      anchor: `一张"翻车 vs 安全"对比卡，红绿配色强烈`,
      anchor_reason: `对比画面天然适合截图收藏，解决"我是不是也踩了"的焦虑`,
      genes: ["情绪钩子", "身份标签"],
      hit_reason: `呼应热点报告中"${kw}"高频但伴随踩坑痛点`,
    },
    {
      topic: `90%的${firstAud}都不知道${kw}的正确打开方式`,
      title: `关于${kw}，你可能一直做错了`,
      angle: `用信息差制造"原来如此"的顿悟感`,
      anchor: `一句扎心金句："你省下的钱，都交了智商税"`,
      anchor_reason: `金句易截图传播，戳中"被割韭菜"共鸣`,
      genes: ["信息差", "情绪钩子"],
      hit_reason: `填补报告中提到的"认知缺口"内容角度空白`,
    },
    {
      topic: `${firstType}也能出片？${firstAud}直接抄作业`,
      title: `${firstAud}照着做就对了`,
      angle: `用行动触发降低决策成本，给现成模板`,
      anchor: `一个可复用的"傻瓜式清单/模板"`,
      anchor_reason: `模板类内容收藏率极高，用户会存了慢慢用`,
      genes: ["行动触发", "身份标签"],
      hit_reason: `承接报告里"想要但懒得想"的受众需求`,
    },
    {
      topic: `越懒越有效？${kw}的反常识真相`,
      title: `${kw}别太努力`,
      angle: `反常识冲突颠覆固有认知，制造好奇`,
      anchor: `一个惊人数据结论："少做这一步，效果好3倍"`,
      anchor_reason: `反直觉数据最易被转发讨论`,
      genes: ["反常识冲突", "信息差"],
      hit_reason: `利用报告中"过度护肤/过度努力"的讨论热度`,
    },
    {
      topic: `${firstAud}私藏的${kw}神器，今天破圈了`,
      title: `小众但好用的${kw}好物`,
      angle: `身份圈层背书 + 种草，强化归属感`,
      anchor: `一张"我的桌面/梳妆台"实拍九宫格`,
      anchor_reason: `真实感实拍易引发"求链接"互动`,
      genes: ["身份标签", "情绪钩子"],
      hit_reason: `踩中报告里"种草推荐"类内容上升通道`,
    },
  ];
  const out = [];
  for (let i = 0; i < count; i++) {
    const b = bank[i % bank.length];
    const click = 4 + (i % 2);
    const spread = 4 + ((i + 1) % 2);
    const exec = 3 + (i % 3);
    out.push({
      ...b,
      score: { click, spread, exec, total: click + spread + exec },
      edge: click + spread + exec < 10,
      safety: { level: "safe", category: "", reason: "" },
    });
  }
  return out;
}

// ---------- 选题：导出 ----------
export async function generateTopics(payload) {
  const hasKey = !!process.env.VC_LLM_API_KEY;
  if (!hasKey) {
    return { model: "mock", topics: sortAndClean(mockTopics(payload)) };
  }
  try {
    const { system, user } = buildPrompt(payload);
    const raw = await callLLM(system, user);
    if (!Array.isArray(raw)) throw new Error("LLM 返回非数组");
    return { model: process.env.VC_LLM_MODEL || "gpt-4o-mini", topics: sortAndClean(raw) };
  } catch (e) {
    return {
      model: "mock(fallback)",
      note: `真实模型调用失败，已降级示例：${e.message}`,
      topics: sortAndClean(mockTopics(payload)),
    };
  }
}

// ---------- 仿写二创：清洗 ----------
function sanitizeRewrite(r) {
  const safe = (v, d = "—") =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const genes = Array.isArray(r?.genes) ? r.genes.slice(0, 3) : [];
  const text = [r?.topic, r?.draft, r?.angle_shift].join(" ");
  return {
    topic: safe(r?.topic),
    target_audience: safe(r?.target_audience),
    angle_shift: safe(r?.angle_shift),
    draft: safe(r?.draft),
    genes,
    safety: computeSafety(r, text),
  };
}

function sanitizeSource(s) {
  const safe = (v, d = "—") =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const modules = Array.isArray(s?.modules)
    ? s.modules.slice(0, 6).map((m) => ({
        name: safe(m?.name),
        role: safe(m?.role),
        transferable: safe(m?.transferable),
      }))
    : [];
  return {
    summary: safe(s?.summary),
    modules,
    mechanism: safe(s?.mechanism),
  };
}

// ---------- 仿写二创：Mock ----------
function mockRewrite(payload) {
  const {
    bestseller_content = "",
    target_audiences = ["学生党"],
    count = 3,
  } = payload || {};
  const kw = (bestseller_content.match(/[#＃]?([\u4e00-\u9fa5]{2,4})/)?.[1]) || "爆款";
  const aud = target_audiences[0] || "同圈层人群";
  const source = {
    summary: `一条围绕「${kw}」的高互动爆款笔记（示例拆解）`,
    modules: [
      { name: "开篇钩子", role: "用强冲突/痛点抓住前 3 秒", transferable: "任何品类都能用'你还在 X？'式反问" },
      { name: "身份代入", role: "圈定精准人群制造归属感", transferable: "替换人群标签即可复用" },
      { name: "干货清单", role: "用编号罗列可操作要点", transferable: "结构化清单收藏率高" },
      { name: "对比/反差", role: "前后对比强化效果", transferable: "找你的'前 vs 后'画面" },
      { name: "行动指令", role: "给出明确下一步（抄作业）", transferable: "降低决策成本" },
    ],
    mechanism: "强身份标签 + 可复制清单 + 反差画面，叠加'抄作业'式低门槛行动触发，天然高收藏转发",
  };
  const rwBank = [
    {
      topic: `${aud}版「${kw}」照着做就对了`,
      target_audience: aud,
      angle_shift: `把原文人群换成${aud}，场景本地化`,
      draft: `姐妹们！原文那套我给${aud}改了一版，亲测更顺手👇\n1. 先 XX 再 XX，别反了\n2. 预算控制在 XX 内，别被割\n3. 卡壳了就回到最基础的哪步\n评论区扣 1 发你同款清单～`,
      genes: ["身份标签", "行动触发"],
    },
    {
      topic: `别再盲目${kw}！${aud}的 3 个坑`,
      target_audience: aud,
      angle_shift: `从'怎么做'切到'别踩坑'（避坑视角）`,
      draft: `踩过才知道的坑！${aud}做${kw}最容易翻车的 3 个点：\n❌ 一上来就堆量\n❌ 跟风买贵的\n❌ 忽略自己的场景\n对应解法在图 2，存好别删～`,
      genes: ["情绪钩子", "信息差"],
    },
    {
      topic: `${kw}还能这样玩？${aud}反常识实测`,
      target_audience: aud,
      angle_shift: `用反常识冲突制造好奇`,
      draft: `都说${kw}要多做，我偏反着试了两周——结果真香？\n数据摆在这：少做这一步，效果反而 +30%\n原理其实很简单，看完你就懂为啥以前白忙活`,
      genes: ["反常识冲突", "信息差"],
    },
  ];
  const rewrites = [];
  for (let i = 0; i < count; i++) {
    rewrites.push({ ...rwBank[i % rwBank.length], safety: { level: "safe", category: "", reason: "" } });
  }
  return { source, rewrites };
}

// ---------- 仿写二创：导出 ----------
export async function rewriteBestseller(payload) {
  const hasKey = !!process.env.VC_LLM_API_KEY;
  if (!hasKey) {
    return { model: "mock", ...mockRewrite(payload) };
  }
  try {
    const { system, user } = buildRewritePrompt(payload);
    const raw = await callLLM(system, user);
    if (!raw || !Array.isArray(raw.rewrites)) {
      throw new Error("LLM 返回缺少 rewrites 数组");
    }
    return {
      model: process.env.VC_LLM_MODEL || "gpt-4o-mini",
      source: sanitizeSource(raw.source || {}),
      rewrites: raw.rewrites.map(sanitizeRewrite),
    };
  } catch (e) {
    return {
      model: "mock(fallback)",
      note: `真实模型调用失败，已降级示例：${e.message}`,
      ...mockRewrite(payload),
    };
  }
}
