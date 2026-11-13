---
title: Order console added to project goals
date: 2026-11-13
summary: "Project goals now scope an order console (monitor, approve, AR picking view, order chat) and a complete order record"
---

# Order console added to project goals

## What happened
`docs/project-goals.md` gained an order console frontend section (F1 monitor agent orders, F2 approve or
reject orders that hit a limit, F3 AR view of warehouse picking, F4 per-order chat) and backend goal B5,
a complete order record: original request, declared requirements, quote, lines, substitutions with
reasons, approval decision, and chat messages. Challenge alignment, decisions, non-goals, acceptance
criteria (7–10), interaction flow and open questions were updated to match.

## Decision
AR is back in scope, but only inside the order console. The dataset has no warehouse locations, so the
layout is a mock derived from temperature condition and case dimensions. The console never creates
orders; buyer-facing chat/voice ordering stays a non-goal.

## Next steps
- `plans/261113-2227-mcp-agent-interface` still removes AR code (`orders/gltf.py`, `orders/footprint.py`,
  already staged for deletion) and has no console phase; it needs revising.
- Resolve open questions 4–7: AR code reuse, console audience, chat participants, AR device target.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
