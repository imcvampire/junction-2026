# Valio Aimo purchasing skill

An [Agent Skill](https://agentskills.io) for a customer's own purchasing agent. It teaches the agent
how to use the Valio Aimo MCP server. The server enforces every rule; the skill only guides.

## Files

- `SKILL.md`: the procedure and the error table.
- `references/tags-and-units.md`: how to read tags, allergens, sales units and availability in results.
- `references/worked-example.md`: the reference request from start to finish.
- `references/substitute-research.md`: the mandatory `research_substitutes` web check before any
substitute is ranked or offered.
- `references/journal.md`, `references/journal.schema.json`, `references/journal-example.json`: the
task journal, its JSON Schema and an example.

## Substitutes

Before the agent ranks or offers a substitute, it calls `research_substitutes`. The server runs one
Oxylabs web search per product with the catalog name and the buyer's purpose only, and returns the
cited snippets, which the agent uses for fit, never for price or stock. Without `API_OXYLABS_API_KEY` on the server, the
agent says web context was unavailable and ranks on catalog facts.

## Journals

When a task ends, the agent writes one JSON file to `valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json`
in the host's working directory: what was asked, searched and quoted, what the buyer chose, and the
orders it left behind. Every journal validates against the shipped `journal.schema.json`, so a
viewer can parse it without guessing. The server's audit trail stays the record of truth.