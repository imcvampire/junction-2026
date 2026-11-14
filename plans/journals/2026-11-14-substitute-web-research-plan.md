# Substitute web research plan

Planned `plans/261114-1112-substitute-web-research/`: the purchasing skill must call a new
server-side MCP tool, `research_substitutes`, before ranking or offering substitutes. The tool uses
Gemini (`google-genai` Interactions API, `google_search` tool) and sends only catalog facts and the
buyer's purpose.

Decision: server-side tool over a skill-bundled script, so the Gemini key stays in the API's `.env`
and no customer data leaves the server. Research informs fit ranking only; price, stock and the
assortment still come from `quote` and `search_products`. Failure degrades to catalog-only ranking.

Unverified: the model name `gemini-4-hydrogen` and where the Interactions API exposes grounding
sources. Phase 1 step 1 checks both with one live call.
