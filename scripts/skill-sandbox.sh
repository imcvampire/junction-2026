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

if [[ -z "${VALIO_AIMO_AGENT_KEY:-}" ]]; then
  echo "VALIO_AIMO_AGENT_KEY is not set. Create one with:" >&2
  echo "  mise run agent:create -- --name skill-test --customer <id>" >&2
  echo "then put it in .env." >&2
  exit 1
fi

mkdir -p "$sandbox/.claude/skills"
ln -sfn "$repo_root/skills/valio-aimo-purchasing" "$sandbox/.claude/skills/valio-aimo-purchasing"

# A plain `claude` in the sandbox has no mise environment, so the key is written in literally.
# The sandbox is outside the repo and the file is owner-only.
umask 077
cat >"$sandbox/.mcp.json" <<EOF
{
  "mcpServers": {
    "valio-aimo": {
      "type": "http",
      "url": "$mcp_url",
      "headers": { "Authorization": "Bearer $VALIO_AIMO_AGENT_KEY" }
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
