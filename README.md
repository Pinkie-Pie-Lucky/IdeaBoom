

# 💡 灵感炸了 · IdeaBoom

> 一个把"出爆款"从玄学变成流水线的**小红书选题决策引擎**。
> 不替你写稿，而是帮你"想清楚做什么、怎么借势做"。

灵感炸了只做两件事，正好对应创作者的两个真实卡点：

- **看不准** —— 热点来了，到底该不该蹭、从哪切、受众买不买账？
- **仿不像** —— 看到爆款想借鉴又不敢照搬，硬写总"形像神不像"，还容易踩红线被限流。

为此，产品只保留两个功能模块：

| 模块 | 解决的问题 | 一句话说明 |
| --- | --- | --- |
| **AI 智能选题** | 看不准 | 输入一段热点/趋势描述，按五步流水线产出带评分、带传播锚点的可发布选题 |
| **爆款仿写二创** | 仿不像 | 粘贴一条爆款正文，自动拆结构、做"抄神不抄形"的差异化二创 |

---

## ✨ 核心方法论

选题沉淀为 **5 步流水线**：痛点挖掘 → 角度嫁接 → 传播锚点 → 基因植入 → 质量门。
仿写采用 **两步法**：结构拆解 → 同风格二创。

两个"反向的闸"是产品可信度的关键：

- **质量门**：模型生成后自我打分（点击潜力 / 传播性 / 可执行性，各 1–5 分），弱选题（`总分 < 10`）自动标注"边缘"。
- **红线自检**：用"模型语义自检为主 + 极小硬黑名单兜底"判断内容安全风险（色情、暴力、政治敏感、违法违规），明确涉敏的选题会被标记甚至拦截，**正常内容绝不会因为写了"最后一步"之类被误伤**。

---

## 🧱 技术栈

- **零依赖**：纯 Node.js `http` 服务，无需 `npm install`。
- **Node 22+**（用到 ES Module / `fetch`）。
- **LLM 接入**：OpenAI 兼容接口，默认对接 DeepSeek，可切换任意兼容服务。
- 未配置 API Key 时自动进入 **Mock 模式**（返回示例数据，便于本地预览）。

---

## 🚀 快速开始

```bash
# 1. 进入项目
cd viral-compass

# 2.（可选）配置大模型
# 复制示例并填入你自己的 Key
cp .env.example .env
# 编辑 .env：
#   VC_LLM_API_KEY=sk-xxxx
#   VC_LLM_BASE=https://api.deepseek.com/v1
#   VC_LLM_MODEL=deepseek-chat

# 3. 启动
npm start
# 或： node server.js

# 4. 打开浏览器
# http://localhost:4173
```

> 不配置 `.env` 也能直接 `npm start`，此时走 Mock 模式，前端功能完整可体验。

### 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `VC_LLM_API_KEY` | OpenAI 兼容服务的 API Key（留空则 Mock 模式） | 无 |
| `VC_LLM_BASE` | API 基地址（含 `/v1`） | `https://api.openai.com/v1` |
| `VC_LLM_MODEL` | 模型名 | `gpt-4o-mini` |
| `PORT` | 服务端口 | `4173` |

**安全提示**：`.env` 已在 `.gitignore` 中忽略，请**切勿**将真实 Key 提交到仓库。

---

## 📂 目录结构

```
viral-compass/
├── server.js              # 纯 Node http 服务：静态托管 + 两个 API
├── src/
│   ├── ai.js              # LLM 调用 / JSON 解析 / 安全判定 / Mock 兜底
│   └── prompt.js          # 选题 & 仿写两大 Prompt 拼装
├── public/
│   ├── index.html         # 前端页面（含两个功能模块）
│   ├── app.js             # 前端逻辑
│   └── styles.css         # 样式（红橙=侦测，紫=生产 双动线）
├── .env.example           # 环境变量示例
├── package.json
└── 智能选题-开发方案.md    # 开发方案文档
```

---

## 🔌 API 说明

### `POST /api/generate-topics` —— AI 智能选题

请求体：

```json
{
  "hotspot_summary": "（必填）热点/趋势描述",
  "content_types": ["干货教程"],
  "audiences": ["学生党"],
  "count": 5
}
```

返回：

```json
{
  "ok": true,
  "model": "deepseek-chat",
  "topics": [
    {
      "topic": "一句话选题",
      "title": "可直接发布的小红书标题",
      "angle": "切入口说明",
      "anchor": "传播锚点",
      "anchor_reason": "为何能引发截图收藏",
      "genes": ["情绪钩子", "信息差"],
      "score": { "click": 5, "spread": 4, "exec": 4, "total": 13 },
      "edge": false,
      "safety": { "level": "safe", "category": "", "reason": "" }
    }
  ]
}
```

### `POST /api/rewrite` —— 爆款仿写二创

请求体：

```json
{
  "bestseller_content": "（必填）爆款笔记正文",
  "target_audiences": ["职场新人"],
  "count": 3
}
```

返回：

```json
{
  "ok": true,
  "model": "deepseek-chat",
  "source": {
    "summary": "原文一句话概括",
    "modules": [{ "name": "", "role": "", "transferable": "" }],
    "mechanism": "爆火机制说明"
  },
  "rewrites": [
    {
      "topic": "二创选题",
      "target_audience": "目标人群",
      "angle_shift": "角度/人群/场景变化",
      "draft": "同风格小红书文案草稿",
      "genes": ["身份标签", "行动触发"],
      "safety": { "level": "safe", "category": "", "reason": "" }
    }
  ]
}
```

---

## 🗺️ 路线图

- [x] AI 智能选题（五步流水线 + 质量门）
- [x] 爆款仿写二创（结构拆解 + 同风格二创）
- [ ] 接回用户发布后的真实数据，反向校准打分模型
- [ ] 多平台适配（抖音 / 公众号等）

---



## 🧩 Codex Skill：小红书选题引擎

仓库内置 `xiaohongshu-topic-engine`，将 IdeaBoom 的选题五步法、质量门、内容安全自检和差异化二创方法沉淀为可复用能力。

Skill 文件位于 `.codex/skills/xiaohongshu-topic-engine/`。在 Codex 对话中可直接点名调用：

```text
使用 $xiaohongshu-topic-engine，为“秋季通勤护肤”生成 5 条面向油痘肌上班族的小红书选题。
```

也可以在请求中说明任务类型，无需指定命令：

```text
根据这段热点报告，按 IdeaBoom 的方法做选题并按传播潜力排序。
```

适用场景：

- 将热点、趋势或用户痛点转成带传播锚点、评分和风险判断的选题；
- 拆解用户有权参考的爆款内容，并进行“保留结构、不复刻表达”的差异化二创；
- 调整或排查项目 API/UI 的生成逻辑时，保持既有 JSON 字段契约。

Skill 不会自动发布内容、抓取平台数据或使用账号凭据；这类操作需单独授权。

若要调整方法论，优先维护 `.codex/skills/xiaohongshu-topic-engine/SKILL.md` 与 `references/`；修改生成实现时，同步检查 `src/prompt.js` 和部署适配的 `app.py`。
