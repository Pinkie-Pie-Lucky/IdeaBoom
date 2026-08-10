// public/app.js
// 智能选题 + 爆款仿写二创：参数收集 → 调后端 → 渲染

// ---- 导航切换 ----
const crumbMap = {
  ai: "AI 智能选题",
  rewrite: "爆款仿写二创",
};
document.querySelectorAll(".nav-item[data-view]").forEach((it) => {
  it.addEventListener("click", () => {
    const v = it.dataset.view;
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    it.classList.add("active");
    document.querySelectorAll(".view").forEach((s) => s.classList.remove("active"));
    document.getElementById("view-" + v).classList.add("active");
    document.getElementById("crumb").textContent = crumbMap[v] || "";
    document.querySelector(".content").scrollTop = 0;
  });
});

// ---- 通用 ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ============ AI 智能选题 ============
const state = { types: [], audiences: [], count: 5 };

function bindChips(containerId, key) {
  document.getElementById(containerId).querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      c.classList.toggle("on");
      const v = c.dataset.v;
      const arr = state[key];
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(v);
    });
  });
}
bindChips("types", "types");
bindChips("audiences", "audiences");

document.querySelectorAll("#count-seg button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#count-seg button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.count = parseInt(b.dataset.v, 10);
  });
});

const hotspot = document.getElementById("hotspot");
const hotspotCount = document.getElementById("hotspot-count");
hotspot.addEventListener("input", () => {
  if (hotspot.value.length > 2000) hotspot.value = hotspot.value.slice(0, 2000);
  hotspotCount.textContent = `${hotspot.value.length} / 2000`;
});

const results = document.getElementById("results");
const stateBox = document.getElementById("result-state");
const noteBar = document.getElementById("note-bar");
const genBtn = document.getElementById("gen-btn");

function ringColor(total) {
  if (total >= 12) return "var(--success)";
  if (total >= 10) return "var(--ai)";
  return "var(--warning)";
}

function renderTopics(topics) {
  results.innerHTML = "";
  topics.forEach((t) => {
    const deg = Math.min(360, (t.score.total / 15) * 360);
    const color = ringColor(t.score.total);
    const genes = (t.genes || []).map((g) => `<span class="gene">${g}</span>`).join("");
    const edgeBadge = t.edge ? `<span class="badge-edge pill pill-orange">边缘·建议优化</span>` : "";
    const sb = t.safety || {};
    const sBadge = sb.level === "blocked"
      ? `<span class="pill pill-red">🚫 已拦截${sb.category ? "（" + sb.category + "）" : ""}</span>`
      : sb.level === "caution"
        ? `<span class="pill pill-orange">⚠ 需复核${sb.category ? "（" + sb.category + "）" : ""}</span>`
        : "";
    const card = document.createElement("div");
    card.className = "topic" + (sb.level === "blocked" ? " blocked" : "");
    card.innerHTML = `
      ${sBadge || edgeBadge || ""}
      <div class="ht">📌 ${escapeHtml(t.title)}</div>
      <div class="tt">${escapeHtml(t.topic)}</div>
      <div class="tr"><b style="color:var(--ink-700)">角度：</b>${escapeHtml(t.angle)}</div>
      <div class="anchor">🖼️ 锚点：${escapeHtml(t.anchor)}<br><span style="color:var(--ink-500)">${escapeHtml(t.anchor_reason)}</span></div>
      <div class="taglist">${genes}</div>
      <div class="tr"><b style="color:var(--ink-700)">爆款理由：</b>${escapeHtml(t.hit_reason)}</div>
      <div class="row">
        <div class="score-ring" style="background:conic-gradient(${color} ${deg}deg,#EEE ${deg}deg)">
          <span>${t.score.total}</span><small>/15</small>
        </div>
        <div class="score-mini">点击${t.score.click} · 传播${t.score.spread} · 执行${t.score.exec}</div>
      </div>`;
    results.appendChild(card);
  });
}

genBtn.addEventListener("click", async () => {
  const hotspot_summary = hotspot.value.trim();
  if (!hotspot_summary) {
    hotspot.focus();
    noteBar.className = "note-bar warn";
    noteBar.textContent = "⚠ 请先填写热点 / 趋势分析报告";
    return;
  }
  noteBar.className = "";
  noteBar.textContent = "";
  stateBox.classList.remove("hidden");
  stateBox.innerHTML = `<div class="state"><span class="spinner"></span>AI 正在按 5 步流水线生成选题…</div>`;
  results.classList.add("hidden");
  genBtn.disabled = true;
  genBtn.textContent = "✨ 生成中…";

  try {
    const resp = await fetch("/api/generate-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotspot_summary,
        content_types: state.types,
        audiences: state.audiences,
        count: state.count,
      }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "生成失败");

    if (data.model && data.model.startsWith("mock")) {
      noteBar.className = "note-bar info";
      noteBar.textContent = `ℹ 当前为示例数据（演示模式）。`;
    } else {
      noteBar.className = "";
      noteBar.textContent = "";
    }

    stateBox.classList.add("hidden");
    results.classList.remove("hidden");
    renderTopics(data.topics || []);
    if (!data.topics || data.topics.length === 0) {
      stateBox.classList.remove("hidden");
      stateBox.innerHTML = `<div class="state"><div class="ico">🫥</div>模型未返回达标选题，请调整热点报告或参数后重试</div>`;
      results.classList.add("hidden");
    }
  } catch (e) {
    stateBox.classList.remove("hidden");
    stateBox.innerHTML = `<div class="state"><div class="ico">⚠️</div>生成出错：${escapeHtml(e.message)}<br><span class="muted-note">请检查服务是否运行，或稍后重试</span></div>`;
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = "✨ 生成选题";
  }
});

// ============ 爆款仿写二创 ============
const rwState = { audiences: [], count: 3 };

document.querySelectorAll("#rw-audiences .chip").forEach((c) => {
  c.addEventListener("click", () => {
    c.classList.toggle("on");
    const v = c.dataset.v;
    const i = rwState.audiences.indexOf(v);
    if (i >= 0) rwState.audiences.splice(i, 1);
    else rwState.audiences.push(v);
  });
});

document.querySelectorAll("#rw-count-seg button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#rw-count-seg button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    rwState.count = parseInt(b.dataset.v, 10);
  });
});

const rwContent = document.getElementById("rw-content");
const rwCount = document.getElementById("rw-count");
rwContent.addEventListener("input", () => {
  if (rwContent.value.length > 3000) rwContent.value = rwContent.value.slice(0, 3000);
  rwCount.textContent = `${rwContent.value.length} / 3000`;
});

const rwResults = document.getElementById("rw-results");
const rwStateBox = document.getElementById("rw-state");
const rwNote = document.getElementById("rw-note");
const rwBtn = document.getElementById("rw-btn");

function renderRewrite(source, rewrites) {
  rwResults.innerHTML = "";

  // 原文结构拆解卡
  const srcCard = document.createElement("div");
  srcCard.className = "card src-card";
  const mods = (source.modules || [])
    .map(
      (m) => `<div class="mod"><b>${escapeHtml(m.name)}</b><span>${escapeHtml(m.role)}</span><i>可迁移：${escapeHtml(m.transferable)}</i></div>`
    )
    .join("");
  srcCard.innerHTML = `
    <div class="card-h"><h3>📐 原文结构拆解</h3></div>
    <div class="src-summary">${escapeHtml(source.summary || "—")}</div>
    <div class="mods">${mods}</div>
    <div class="mech"><b>🔥 爆火机制：</b>${escapeHtml(source.mechanism || "—")}</div>`;
  rwResults.appendChild(srcCard);

  // 二创标题
  const head = document.createElement("div");
  head.className = "rw-head";
  head.textContent = `🪄 同风格二创方案（${rewrites.length}）`;
  rwResults.appendChild(head);

  // 二创卡片网格
  const grid = document.createElement("div");
  grid.className = "results";
  rewrites.forEach((r) => {
    const genes = (r.genes || []).map((g) => `<span class="gene">${g}</span>`).join("");
    const sb = r.safety || {};
    const sBadge = sb.level === "blocked"
      ? `<span class="pill pill-red">🚫 已拦截${sb.category ? "（" + sb.category + "）" : ""}</span>`
      : sb.level === "caution"
        ? `<span class="pill pill-orange">⚠ 需复核${sb.category ? "（" + sb.category + "）" : ""}</span>`
        : "";
    const card = document.createElement("div");
    card.className = "topic" + (sb.level === "blocked" ? " blocked" : "");
    card.innerHTML = `
      ${sBadge ? sBadge : ""}
      <div class="ht">👥 ${escapeHtml(r.target_audience)}</div>
      <div class="tt">${escapeHtml(r.topic)}</div>
      <div class="tr"><b style="color:var(--ink-700)">角度变化：</b>${escapeHtml(r.angle_shift)}</div>
      <div class="draft">${escapeHtml(r.draft)}</div>
      <div class="taglist">${genes}</div>`;
    grid.appendChild(card);
  });
  rwResults.appendChild(grid);
}

rwBtn.addEventListener("click", async () => {
  const content = rwContent.value.trim();
  if (!content) {
    rwContent.focus();
    rwNote.className = "note-bar warn";
    rwNote.textContent = "⚠ 请先粘贴爆款笔记内容";
    return;
  }
  rwNote.className = "";
  rwNote.textContent = "";
  rwStateBox.classList.remove("hidden");
  rwStateBox.innerHTML = `<div class="state"><span class="spinner"></span>AI 正在拆解结构并生成二创…</div>`;
  rwResults.classList.add("hidden");
  rwBtn.disabled = true;
  rwBtn.textContent = "🪄 生成中…";

  try {
    const resp = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bestseller_content: content,
        target_audiences: rwState.audiences,
        count: rwState.count,
      }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "生成失败");

    if (data.model && data.model.startsWith("mock")) {
      rwNote.className = "note-bar info";
      rwNote.textContent = `ℹ 当前为示例数据（演示模式）。`;
    } else {
      rwNote.className = "";
      rwNote.textContent = "";
    }

    rwStateBox.classList.add("hidden");
    rwResults.classList.remove("hidden");
    renderRewrite(data.source || {}, data.rewrites || []);
    if (!data.rewrites || data.rewrites.length === 0) {
      rwStateBox.classList.remove("hidden");
      rwStateBox.innerHTML = `<div class="state"><div class="ico">🫥</div>未生成二创结果，请调整内容或参数后重试</div>`;
      rwResults.classList.add("hidden");
    }
  } catch (e) {
    rwStateBox.classList.remove("hidden");
    rwStateBox.innerHTML = `<div class="state"><div class="ico">⚠️</div>生成出错：${escapeHtml(e.message)}<br><span class="muted-note">请检查服务是否运行，或稍后重试</span></div>`;
  } finally {
    rwBtn.disabled = false;
    rwBtn.textContent = "🪄 拆解并二创";
  }
});
