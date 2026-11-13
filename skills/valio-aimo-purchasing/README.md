# Valio Aimo purchasing skill

An [Agent Skill](https://agentskills.io) for a customer's own purchasing agent. It teaches the agent
how to use the Valio Aimo MCP server. The server enforces every rule; the skill only guides.

## Install

1. Get an agent key from your Valio Aimo contact. Operators create one with
   `mise run agent:create -- --name <name> --customer <customer-id> [--role admin]`, which prints it
   once. A `member` key (the default) buys; an `admin` key can also approve the company's escalated
   orders.
2. Connect the MCP server (Claude Code shown; any MCP host with streamable HTTP and custom headers
   works):

   ```sh
   claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp \
     --header "Authorization: Bearer $VALIO_AIMO_AGENT_KEY"
   ```

3. Copy this folder into the host's skills directory, for example
   `cp -r skills/valio-aimo-purchasing ~/.claude/skills/` (or `.claude/skills/` in a project).

Keep the key in the host's MCP configuration or an environment variable. Never paste it into a
prompt or commit it.

## Files

- `SKILL.md`: the procedure and the error table.
- `references/tags-and-units.md`: how to read tags, allergens, sales units and availability in results.
- `references/worked-example.md`: the reference request from start to finish.
