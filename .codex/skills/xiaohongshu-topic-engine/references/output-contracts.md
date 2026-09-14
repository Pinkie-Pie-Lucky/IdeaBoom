# Output contracts

## Topic generation

Input: `hotspot_summary` (required), `content_types`, `audiences`, `count`.

Each topic includes `topic`, `title`, `angle`, `anchor`, `anchor_reason`, `genes`, `hit_reason`, `score`, `edge`, and `safety`. `score` has `click`, `spread`, `exec`, and `total`; `total` equals the other three scores summed. Return results in descending `total` order.

## Differentiated rewrite

Input: `bestseller_content` (required), `target_audiences`, `count`.

Return a `source` object with `summary`, `modules`, and `mechanism`, plus `rewrites`. Each rewrite contains `topic`, `target_audience`, `angle_shift`, `draft`, `genes`, and `safety`.

## Safety

Use `safe` for no identified risk, `caution` for content needing human review, and `blocked` for content that must be rewritten safely or omitted. Categories include explicit sexual content, graphic violence, political sensitivity, unlawful activity, deceptive medical claims, infringement, discrimination, and personal attacks.
