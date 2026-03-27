import { Tool } from './base.js';

export class MCPTool extends Tool {
  constructor({ manager }) {
    super();
    this.manager = manager;
  }

  get name() {
    return 'mcp';
  }
  get description() {
    return 'List MCP servers/tools and call MCP tools.';
  }
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list_servers', 'list_tools', 'call_tool'] },
        server: { type: 'string' },
        toolName: { type: 'string' },
        arguments: { type: 'object' },
      },
      required: ['action'],
    };
  }

  async execute({ action, server, toolName, arguments: args }) {
    if (!this.manager) return 'Error: MCP manager not configured';
    if (action === 'list_servers') return this.manager.listServers();
    if (action === 'list_tools') return this.manager.listTools();
    if (action === 'call_tool') {
      if (!server || !toolName) return 'Error: server and toolName are required';
      return this.manager.callTool({ server, toolName, arguments: args || {} });
    }
    return `Error: unsupported action ${action}`;
  }
}
