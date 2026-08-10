---
title: 灵感炸了 · IdeaBoom
emoji: 💡
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: 6.17.3
app_file: app.py
pinned: false
---

# 💡 灵感炸了 · 创作工作台

让「从 0 想选题」和「跟爆款二创」这两件最痛的事，变成有方法、有评分、有合规底线的确定性动作。

## 功能

- **✨ AI 智能选题**：粘贴热点报告 + 勾选参数，AI 按 5 步流水线产出带传播锚点 / 爆款基因 / 三维打分的结构化选题（`<10 分` 自动标注"边缘"）
- **🪄 爆款仿写二创**：粘贴爆款笔记，AI 先拆结构骨架，再迁移人群 / 场景生成差异化同风格二创

## 技术栈

- 核心服务：**Node.js（零依赖，纯 `node:http`）**，入口 `server.js`
- 前端：原生 HTML / CSS / JS（`public/`）
- AI：OpenAI 兼容协议，默认对接 DeepSeek（可在环境变量中切换）

## 部署说明（魔搭创空间）

魔搭以 Gradio SDK 运行本仓库，入口 `app.py`。`app.py` 会：

1. **优先**在环境中查找 `node`，存在则启动 `node server.js`（完整功能）；
2. 若环境无 Node，则**降级**为 Python 内置 HTTP 服务（静态页面 + 选题接口，功能受限）。

### 环境变量（魔搭「设置 → 环境变量」中配置）

| 变量 | 说明 | 示例 |
|---|---|---|
| `VC_LLM_API_KEY` | AI 服务密钥（必填，否则走 mock 示例数据） | `sk-xxxx` |
| `VC_LLM_BASE` | OpenAI 兼容 API 地址 | `https://api.deepseek.com/v1` |
| `VC_LLM_MODEL` | 模型名 | `deepseek-v4-flash` |

## 本地运行

```bash
node server.js
# 打开 http://localhost:4173
```
