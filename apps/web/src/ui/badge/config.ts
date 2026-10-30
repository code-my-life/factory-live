/** A toolset `mcp-<server>` stands for an MCP server, which has its own badge: it is not repeated. */
export function isMcpToolset(toolset: string): boolean {
  return toolset.startsWith('mcp-');
}

/**
 * A toolset `mcp-<server>` is hidden only when its server is declared in the agent's `mcp` list (the
 * server's own badge stands for it). Otherwise it stays, so the screen shows the inconsistency.
 */
export function hiddenToolset(toolset: string, mcp: readonly string[]): boolean {
  return isMcpToolset(toolset) && mcp.includes(toolset.slice('mcp-'.length));
}

/** The names of a configuration list, as the server writes a drift (`a, b, c`). */
export function splitNames(value: string): string[] {
  return value.split(', ');
}
