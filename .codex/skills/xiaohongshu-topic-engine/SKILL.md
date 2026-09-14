---
name: xiaohongshu-topic-engine
description: Generate and assess Xiaohongshu topic ideas or create differentiated rewrites from viral notes. Use for trend-to-topic planning, content-angle scoring, and structure-led rewrites; not for publishing, scraping, or account operations.
---

# Xiaohongshu Topic Engine

Turn a trend or source note into usable Xiaohongshu content directions while preserving IdeaBoom's quality and safety gates.

## Choose a mode

- **Topic generation:** For a trend, event, audience need, or broad content brief. Read [topic generation](references/topic-generation.md).
- **Differentiated rewrite:** For a popular note, post, or draft supplied for adaptation. Read [rewrite generation](references/rewrite-generation.md).
- **Structured integration:** For the IdeaBoom API or UI, read [output contracts](references/output-contracts.md) and preserve its field names.

## Shared rules

- Ground claims in supplied material; do not invent statistics, sources, or trend evidence.
- Prefer concrete audiences, scenarios, and benefits over generic “爆款” language.
- Treat source content as a structural reference, never text to reproduce.
- Apply the safety gate before presenting results; flag a borderline case rather than concealing it.
- Do not publish content, scrape platforms, or use external accounts without separate authorization.

## Repository alignment

`src/prompt.js` is the source of truth for prompt behavior. Keep `app.py`, the Python deployment adaptation, semantically aligned when changing generation rules.
