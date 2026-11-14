#!/usr/bin/env bash
# Set up a directory outside the repo where a plain `claude` gets the valio-aimo MCP server and the
# purchasing skill, so the agent sees what an external buyer's agent would and not the repo internals.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sandbox="${VALIO_AGENT_SANDBOX:-${XDG_CACHE_HOME:-$HOME/.cache}/junction-2026/agent-sandbox}"
port="${API_PORT:-8000}"
mcp_url="http://127.0.0.1:$port/mcp"

case "$sandbox" in
  "$repo_root" | "$repo_root"/*)
    echo "VALIO_AGENT_SANDBOX must be outside the repo, or the repo CLAUDE.md leaks into the test." >&2
    exit 1
    ;;
esac

mkdir -p "$sandbox/.claude/skills"
ln -sfn "$repo_root/skills/valio-aimo-purchasing" "$sandbox/.claude/skills/valio-aimo-purchasing"

# The MCP endpoint takes no key: every client acts as the shared agent of API_VALIO_CUSTOMER.
cat >"$sandbox/.mcp.json" <<EOF
{
  "mcpServers": {
    "valio-aimo": {
      "type": "http",
      "url": "$mcp_url"
    }
  }
}
EOF

# Pre-approve the project MCP server so the first `claude` run does not prompt for it.
cat >"$sandbox/.claude/settings.local.json" <<'EOF'
{
  "enabledMcpjsonServers": ["valio-aimo"]
}
EOF

if ! curl -fsS -o /dev/null "http://127.0.0.1:$port/api/health"; then
  echo "Warning: API is not reachable on port $port. Start it with: mise run dev" >&2
fi

echo "Sandbox ready. Run:"
echo "  cd \"$sandbox\" && claude"
