export class MCPConnectionManager {
  constructor({ servers = [], timeoutSeconds = 30 } = {}) {
    this.servers = servers;
    this.timeoutMs = Math.max(1000, Number(timeoutSeconds || 30) * 1000);
  }

  listServers() {
    return this.servers.map((s) => ({
      name: s.name,
      transport: s.transport || 'http',
      url: s.url || null,
      command: s.command || null,
    }));
  }

  listTools() {
    const out = [];
    for (const s of this.servers) {
      for (const t of s.tools || []) {
        out.push({
          server: s.name,
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        });
      }
    }
    return out;
  }

  async callTool({ server, toolName, arguments: args = {} }) {
    const spec = this.servers.find((s) => s.name === server);
    if (!spec) throw new Error(`MCP server not found: ${server}`);
    if (!spec.url) {
      return { error: 'MCP stdio transport is not implemented in this build yet' };
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(spec.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (body.error) return { error: body.error.message || String(body.error) };
      return body.result;
    } finally {
      clearTimeout(t);
    }
  }
}
