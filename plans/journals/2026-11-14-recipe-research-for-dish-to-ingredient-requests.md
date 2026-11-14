---
title: Recipe research for dish-to-ingredient requests
date: 2026-11-14
summary: Added research_recipe MCP tool so buyers can name a dish and the agent finds and confirms the ingredient list via web search
---

# Recipe research for dish-to-ingredient requests

## What happened
Buyers who name a dish ("beef stroganoff for 80") instead of ingredients had no supported path. Added `research_recipe` to the MCP server: one Oxylabs search with a fixed, server-built query (`<dish> recipe ingredients`, fi/sv variants), returning cited, untrusted snippets.

## Key changes
- `apps/api/src/api/research/service.py`: cache, single-flight lock, failure memo and per-agent budget factored into `ResearchService._once`, shared by `research` and `research_recipe`. Cache keys are namespaced (`substitutes` / `recipe`).
- `apps/api/src/api/research/models.py`: `RecipeRequest` with `dish` validated as one line of 2-80 chars with no digits and no `@`, so quantities, ids and emails cannot reach the provider. `RecipeView` keeps snippets up to 800 chars because ingredient lists run long.
- `apps/api/src/api/mcp/server.py`: the tool, `TOOL_NAMES`, and the server instructions.
- Skill: step 1a in SKILL.md, the new `references/recipe-research.md`, error table, README, journal.md.
- `journal.schema.json`: optional `recipes[]` with the confirmed `ingredients`. Regenerated web types and added a `RecipeList` to the journal viewer.

## Decisions
- The web list is only a suggestion. The buyer confirms the ingredients through a dialog before any catalog search or quote, and the mandate applies to each ingredient.
- If research fails, the agent proposes an unverified list from its own knowledge for the buyer to confirm, so the order is not blocked.
- Servings are never sent to the web; the agent does the scaling.

## Verification
API: 167 passed. Web: 69 passed. Lint and typecheck are clean. The `prettier --check` failure in `apps/web/src/features/orders` and `routes/orders.index.tsx` was already on master and is untouched.

## Next steps
- Try a live Oxylabs query to check that the snippets actually hold ingredient amounts.
- Consider a worked example in the skill for a dish request.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
