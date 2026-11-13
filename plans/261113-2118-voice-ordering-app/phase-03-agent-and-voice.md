---
phase: 3
title: Conversational agent and voice endpoints
status: todo
depends_on: [1, 2]
---

# Phase 3 — Conversational agent and voice endpoints

## Requirements

- All LLM traffic goes through the BE via the `openai` SDK against Verda inference:
  `OPENAI_COMPATIBLE_URL` (+ `/v1`), `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL` (default `kimi-k3-1-pro`),
  loaded from `.env` (gitignored). Read `content`, falling back to `reasoning_content`; record `usage` per turn.
- Verify early that the model supports OpenAI `tools` / `tool_choice` and streaming; if not, fall back to JSON-mode structured actions.
- Agent loop with tool use; tools are thin wrappers over Phase 1/2 services:
  `search_products`, `quote`, `create_order_draft`, `agree_order`, `place_order`, `get_order_status`.
  The agent cannot bypass the approval policy — `place_order` returns `pending_approval` when required.
- Conversation state persisted per session (messages + `flow_state`). `flow_state` mirrors the
  conversation diagram; until the diagram arrives use:
  `gathering → proposing → confirming → ar_offered → placed | escalated`.
- Turn response contract (fixed early so Phase 4 can stub it):
  `{ session_id, reply_text, flow_state, offers[], order?, actions[] }` where `actions` includes
  `offer_ar` once the buyer agrees.
- Cap tool rounds per turn; stream reply text (SSE) so TTS can start on the first sentence.
- Voice: `POST /api/voice/transcribe` (audio → text) and `POST /api/voice/speak` (text → audio stream)
  proxying the chosen provider. Language hint from client.

## Files

- Create: `apps/api/src/api/agent/{loop,tools,prompts,state}.py`, `apps/api/src/api/voice/provider.py`,
  `apps/api/src/api/routes/{conversations,voice}.py`
- Tests: `apps/api/tests/test_agent_tools.py` (tools against fakes), `apps/api/tests/test_conversations.py`
  (LLM replaced by a scripted fake client — real behavior of our loop, not the model)

## Endpoints

- `POST /api/conversations` → new session
- `POST /api/conversations/{id}/turns` (text) — SSE stream of reply chunks + final turn payload
- `POST /api/voice/transcribe`, `POST /api/voice/speak`

## Validation

- Scripted-fake test: milk example drives `search → quote → draft → confirm` and ends in `ar_offered`.
- One live smoke run against the real LLM with the acceptance-criterion-1 utterance.

## Security

- Rate-limit per session; cap audio upload size and duration.
- Tool arguments validated by Pydantic; LLM output never reaches SQL or upstream calls unvalidated.
- Do not log raw audio; log transcripts with session id only.
