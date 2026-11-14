export const LIVE_ORIGIN = "https://95.133.252.52.sslip.io"
export const MCP_URL = `${LIVE_ORIGIN}/mcp`
export const SKILL_NAME = "valio-aimo-purchasing"
export const SKILL_ARCHIVE_URL = `${LIVE_ORIGIN}/skills/${SKILL_NAME}.tar.gz`
export const REFERENCE_REQUEST =
  "I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements based on price and availability."

export type InstallTab = {
  value: string
  label: string
  intro: string
  code: string
}

export const MCP_TABS: InstallTab[] = [
  {
    value: "claude-code",
    label: "Claude Code",
    intro: "Add the server for your user, then check it with /mcp.",
    code: `claude mcp add --transport http --scope user valio-aimo ${MCP_URL}`,
  },
  {
    value: "claude-desktop",
    label: "Claude Desktop",
    intro:
      "Open Settings → Connectors → Add custom connector, name it valio-aimo and paste this URL.",
    code: MCP_URL,
  },
  {
    value: "cursor",
    label: "Cursor",
    intro:
      "Add the server to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).",
    code: JSON.stringify(
      { mcpServers: { "valio-aimo": { url: MCP_URL } } },
      null,
      2
    ),
  },
  {
    value: "vscode",
    label: "VS Code",
    intro: "Register the server with the VS Code CLI.",
    code: `code --add-mcp '${JSON.stringify({ name: "valio-aimo", type: "http", url: MCP_URL })}'`,
  },
]

export const SKILL_TABS: InstallTab[] = [
  {
    value: "user",
    label: "All projects",
    intro:
      "Install the skill for your user so every Claude Code session has it.",
    code: `mkdir -p ~/.claude/skills\ncurl -fsSL ${SKILL_ARCHIVE_URL} | tar -xz -C ~/.claude/skills`,
  },
  {
    value: "project",
    label: "One project",
    intro: "Install the skill into the current project only.",
    code: `mkdir -p .claude/skills\ncurl -fsSL ${SKILL_ARCHIVE_URL} | tar -xz -C .claude/skills`,
  },
  {
    value: "other",
    label: "Other hosts",
    intro: `Any Agent Skills host works: extract the archive into its skills directory so it holds ${SKILL_NAME}/SKILL.md.`,
    code: `curl -fsSLO ${SKILL_ARCHIVE_URL}\ntar -xzf ${SKILL_NAME}.tar.gz -C <your-skills-dir>`,
  },
]

export const AGENT_INSTALL_PROMPT = `Set up the Valio Aimo purchasing tools for me:

1. Add the MCP server "valio-aimo" (streamable HTTP, no API key) at ${MCP_URL}
   - Claude Code: run \`claude mcp add --transport http --scope user valio-aimo ${MCP_URL}\`
   - Any other host: add it to that host's MCP config.
2. Install the "${SKILL_NAME}" Agent Skill for my user:
   mkdir -p ~/.claude/skills && curl -fsSL ${SKILL_ARCHIVE_URL} | tar -xz -C ~/.claude/skills
   (For another host, extract the archive into its skills directory instead.)
3. Check that ~/.claude/skills/${SKILL_NAME}/SKILL.md exists and that ${LIVE_ORIGIN}/api/health answers.
4. Tell me what you changed, and that I need to restart the session so the server and skill load.

Do not place any orders yet.`
