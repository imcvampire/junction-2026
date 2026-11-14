---
title: Substitute web research tool
date: 2026-11-14
summary: research_substitutes MCP tool and mandatory skill step shipped; live check blocked by an exhausted Gemini quota
---

# Substitute web research tool

## What happened
- Implemented plan `plans/261114-1112-substitute-web-research`, phases 1 and 2: the read-only MCP tool `research_substitutes` (`apps/api/src/api/research/`), a mandatory step in the skill before any substitute is ranked, optional journal `research[]`, and a "Web research" section in the viewer.
- Phase 3 (live sandbox run) is blocked: the Gemini key answers `429 You exceeded your current quota`. `gemini-4-hydrogen` exists (an unknown model name answers 404).
- The SDK's default retries turned one 429 into a stall of more than 120 s. The client now uses `HttpRetryOptions(attempts=1)`; the same call fails in 0.5 s as `research_unavailable`.
- The test `settings` fixture inherited `API_GEMINI_API_KEY` from mise's env, and one MCP test made a live call. The fixture now pins `gemini_api_key=None`.
- The grounding shape came from the SDK 3.3.0 models, not a live response. Queries are read from `google_search_call.arguments.queries`, sources from `url_citation` annotations. This is tested against `google.genai.interactions.Interaction`.

## Decisions
- Applied the review fixes. A failure is replayed only to identical callers that queued behind it, so a later retry still searches. A cache hit echoes the caller's own purpose and candidate order. The purpose must be one line. Without an HTTP status, only transport errors count as retryable. The call sends `store=False`.
- The journal `outcome` enum stays `ok | not_configured | unavailable | rate_limited`; argument errors go to `errors[]`.
- `journal-example.json` has no research entry, because its scenario needed no substitute; the example lives in `journal.md` and is tested.

## Next steps
- Restore the Gemini quota, restart `mise run dev` (the running server predates the key), and re-run phase 3 steps 2-5.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
