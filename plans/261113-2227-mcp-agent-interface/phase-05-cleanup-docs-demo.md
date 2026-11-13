# Phase 5: Legacy removal, docs and demo verification

Proves acceptance criteria 1–6 end to end and removes the out-of-scope surface.

## Steps

1. **Legacy removal** (pending confirmation, unresolved question 2 in `plan.md`):
   - delete `api/agent/`, `api/voice/`, `routes/conversations.py`, `routes/voice.py`,
     `orders/footprint.py`, `orders/gltf.py` and their tests (`test_agent_tools.py`,
     `test_conversations.py`, `test_footprint.py`);
   - delete the buyer-flow REST routes (`POST /orders`, `/agree`, `/place`, `GET /orders?session_id`)
     and the draft/agree code paths in `OrderService`. Keep `get`, `audit` and `decide`;
   - drop the `openai` dependency and the `OPENAI_COMPATIBLE_*`, `API_VOICE_*` and `API_AR_*`
     settings, plus the `sessions` table usage (leave the table; it is harmless);
   - remove `apps/web/.vite` leftovers.
   If the user keeps it instead, only make sure no `/agent/v1` or `/mcp` path imports it.
2. **Docs**:
   - rewrite `docs/backend-api.md` around the agent interface: auth, MCP tools, REST endpoints,
     error codes, approval endpoints, configuration (`API_QUOTE_TTL_S`,
     `API_AGENT_QUOTES_PER_MINUTE`);
   - `docs/project-goals.md`: move the answered open questions into Decisions;
   - `CLAUDE.md` commands: `mise run agent:create`;
   - mark `plans/261113-2118-voice-ordering-app/plan.md` as superseded.
3. **Secrets check (AC5)**: `git grep -nE 'vaa_[A-Za-z0-9_-]{20,}|X-API-Key: [A-Za-z0-9]'` is empty;
   `.env.example` holds placeholders only; the agent key lives only in the host's MCP config.
4. **Live demo (AC1–4, AC6)** with Claude Code:
   - `mise run dev`; `mise run agent:create -- --name hotel-demo --customer <id>`;
   - `claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp --header "Authorization: Bearer <key>"`;
     install the skill;
   - run the reference request. Expect a product, a price, availability for the date, the sales-unit
     quantity, and, given 1,000 L of milk, an escalation to `pending_approval` above 500 EUR;
   - approve via `POST /api/orders/{id}/approve`; the agent reads `approved` back;
   - run a small order under the limit and expect `placed` with no human step;
   - stale-price check: shorten `API_QUOTE_TTL_S` or tamper with the stored quote price, then
     `place_order` is refused;
   - save `audit.txt` for both orders into `plans/reports/`.
5. `mise run check` green.

## Validation

All six acceptance criteria are checked off, with the audit text and transcript excerpt saved in
`plans/reports/demo-<date>-mcp-agent.md`.
