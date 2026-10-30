/** A toolset `mcp-<server>` stands for an MCP server, which has its own badge: it is not repeated. */
export function isMcpToolset(toolset: string): boolean {
  return toolset.startsWith('mcp-');
}

/** The names of a configuration list, as the server writes a drift (`a, b, c`). */
export function splitNames(value: string): string[] {
  return value.split(', ');
}
