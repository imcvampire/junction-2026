# Valio Aimo agent interface

Junction 2026, Valio Aimo challenge: a backend that lets an external purchasing agent find products,
get live customer prices and availability, and place orders at fixed quoted prices, with human
approval when the agent goes beyond its mandate. Agents connect over MCP or REST and are guided by
the [`valio-aimo-purchasing`](skills/valio-aimo-purchasing/SKILL.md) skill.

- Challenge brief: [`project.md`](project.md)
- Goals and acceptance criteria: [`docs/project-goals.md`](docs/project-goals.md)
- API, MCP tools, errors and approval: [`docs/backend-api.md`](docs/backend-api.md)

The dataset in `apps/api/data/` is mock data for Junction 2026 only.

## Run the project

You need [mise](https://mise.jdx.dev). It installs Python and uv and loads `.env` into every task.

```sh
mise install                 # Python and uv
cp .env.example .env         # then set API_VALIO_API_KEY (challenge API key; never commit it)
mise run install             # API dependencies
mise run dev                 # API on http://127.0.0.1:8000, MCP at /mcp, REST docs at /api/docs
```

Without `API_VALIO_API_KEY` the server still starts, but quote and order calls fail with
`upstream_not_configured`.

Checks:

```sh
mise run check               # lint, typecheck and tests
mise run fmt                 # auto-fix lint and formatting
cd apps/api && uv run pytest tests/test_<area>.py   # one test file
```

## Test the agent with Claude Code

`mise run skill:sandbox` creates a directory outside the repo where a plain `claude` has the
`valio-aimo` MCP server and the purchasing skill. Being outside the repo keeps this repo's
`CLAUDE.md` and backend docs out of the agent's context, so it sees only what an external buyer's
agent would.

1. Start the API with `mise run dev` and leave it running. The MCP endpoint needs no key: every
   MCP client acts as the shared agent `agt_mcp` of `API_VALIO_CUSTOMER`, with the global spend
   threshold as its limit.
2. Build the sandbox and start Claude Code in it:

   ```sh
   mise run skill:sandbox
   cd ~/.cache/junction-2026/agent-sandbox && claude
   ```

   Accept the folder trust prompt on the first run. `/mcp` should show `valio-aimo` connected.
3. Give it the reference request:

   > I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our
   > requirements based on price and availability.

   Expect `whoami`, then `search_products`, a `quote` of a short list, and `place_order`. Over the
   spend limit, the order comes back `pending_approval`.
4. Act as the human approver, then let the agent read the decision with `get_order`:

   ```sh
   curl -X POST http://127.0.0.1:8000/api/orders/<order-id>/approve \
     -H 'Content-Type: application/json' -d '{"reason": "Approved for Monday delivery"}'
   curl http://127.0.0.1:8000/api/orders/<order-id>/audit.txt
   ```

Notes:

- Run `mise run skill:sandbox` again after changing `API_PORT`.
- The skill is symlinked from `skills/`, so edits apply to the next `claude` session.
- Set `VALIO_AGENT_SANDBOX` to put the sandbox elsewhere; it must be outside the repo.
- Your global Claude Code MCP servers and `~/.claude` settings still load in the sandbox.
