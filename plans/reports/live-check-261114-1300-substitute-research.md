# Live check: substitute web research

Date: 2026-11-14, updated 13:40 Europe/Helsinki. Plan: `plans/261114-1112-substitute-web-research`.

## Result

The server tool works live on Oxylabs. The sandbox agent run (phase 3, steps 2-5) is still pending.

The first build used Gemini with Google Search. That key answered `429 You exceeded your current
quota` on every call, so at the user's request search moved to the Oxylabs Web API
(`POST https://webapi.oxylabs.io/v1/search`, Bearer key in `API_OXYLABS_API_KEY`). Gemini and
`google-genai` are removed.

## What ran

| Check | Result |
|---|---|
| Key type | Pass: the key is a Web API key (one direct search returned 200 in 2.1 s). |
| `research_substitutes` over MCP with 464073 and four Arla candidates, purpose `coffee` | Pass: 5 searches in parallel (at most 3 at once), 4.1 s, 15 sources grouped by product id. |
| Identical second call | Pass: `cached: true`, 0 ms, no new search. |
| Queries hold only the catalog name and the purpose | Pass, for example `Arla Semi skimmed milkdrink 1 L UHT lactose free coffee`. Origin words (`Suomesta`, `Suomi`) and pack counts are now stripped. |
| Results relevant to the purpose | Mostly: the original's search found Valio coffee-milk pages about foaming. Some results describe a similar product or another retailer; the skill says to use only what speaks to the purpose. |
| Server log | Pass: `research_done` with ids, purpose, latency and source count; no key, no queries at INFO. |
| Earlier, on Gemini: no key gives `research_not_configured`; a failed upstream fails fast as `research_unavailable`; an unknown candidate gives `unknown_product` before any search | Pass. The same paths are covered by unit tests for Oxylabs (401, 400, 429, 503, transport error, one of several searches failing). |
| `research_substitutes` called once, before the substitute dialog, in a sandbox session | Not run yet. |
| Journal `research[]` matches the tool result; journals open in the viewer | Not run live. Covered by schema and viewer tests. |
| `mise run check` | Pass. |

## Deviation found and fixed

The test `settings` fixture inherited the real key from mise's environment, so one MCP test made
a live call. The fixture now sets `oxylabs_api_key=None`.

## To finish

1. Restart `mise run dev` (the server on port 8000 started before the key was in `.env`).
2. Run phase 3 steps 2-5 in `mise run skill:sandbox` with a forced shortfall.
