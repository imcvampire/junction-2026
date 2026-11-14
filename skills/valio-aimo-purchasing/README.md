# Valio Aimo purchasing skill

An [Agent Skill](https://agentskills.io) for a customer's own purchasing agent. It teaches the agent
how to use the Valio Aimo MCP server. The server enforces every rule; the skill only guides.

## Install

1. Connect the MCP server (Claude Code shown; any MCP host with streamable HTTP works). It needs
   no key: in this proof of concept every agent works for the same company, as one shared agent
   that can buy and can pass on a human's approval or rejection of the company's escalated orders.

   ```sh
   claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp
   ```

2. Copy this folder into the host's skills directory, for example
   `cp -r skills/valio-aimo-purchasing ~/.claude/skills/` (or `.claude/skills/` in a project).

## Files

- `SKILL.md`: the procedure and the error table.
- `references/tags-and-units.md`: how to read tags, allergens, sales units and availability in results.
- `references/worked-example.md`: the reference request from start to finish.
- `references/journal.md`, `references/journal.schema.json`, `references/journal-example.json`: the
  task journal, its JSON Schema and an example.

## Journals

When a task ends, the agent writes one JSON file to `valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json`
in the host's working directory: what was asked, searched and quoted, what the buyer chose, and the
orders it left behind. Every journal validates against the shipped `journal.schema.json`, so a
viewer can parse it without guessing. The server's audit trail stays the record of truth.
