# MCP endpoint drops agent keys

Date: 2026-11-14

## What changed

`/mcp` no longer requires `Authorization: Bearer`. For the proof of concept every agent works for the
same company, so every MCP client acts as one shared, persisted agent: `agt_mcp` (`mcp-agent`) of
`API_VALIO_CUSTOMER`. The server upserts it at startup (`AgentRegistry.keyless`), which keeps its
mandate and disabled flag but follows the configured customer. Its `key_hash` is `keyless:agt_mcp`,
which is not a SHA-256 digest, so REST can never resolve it. The REST API keeps per-agent keys and
mandates.

`api/mcp/auth.py` is gone. The route now mounts the SDK's `StreamableHTTPASGIApp`: a plain function
endpoint makes Starlette treat it as request/response (GET only, 405 on POST), which the old
middleware class had hidden.

## Consequences

- All MCP clients share quotes, `client_reference` values and "my" orders.
- Anyone who can reach `/mcp` can order and decide escalations; only the host/origin allowlist
  guards it. This is recorded as a demo limitation in `docs/backend-api.md`.
- The sandbox no longer needs `VALIO_AIMO_AGENT_KEY`.
