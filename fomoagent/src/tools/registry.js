/**
 * Tool registry — dynamic registration and execution.
 * Mirrors nanobot's agent/tools/registry.py.
 */

const HINT = '\n\n[Analyze the error above and try a different approach.]';

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(tool) {
    this._tools.set(tool.name, tool);
  }

  unregister(name) {
    this._tools.delete(name);
  }

  get(name) {
    return this._tools.get(name) || null;
  }

  has(name) {
    return this._tools.has(name);
  }

  getDefinitions() {
    return [...this._tools.values()].map(t => t.toSchema());
  }

  /** Alias for backward compat */
  listDefinitions() {
    return this.getDefinitions();
  }

  get toolNames() {
    return [...this._tools.keys()];
  }

  async execute(name, params) {
    const tool = this._tools.get(name);
    if (!tool) {
      return `Error: Tool '${name}' not found. Available: ${this.toolNames.join(', ')}`;
    }

    try {
      const result = await tool.execute(params || {});
      if (typeof result === 'string' && result.startsWith('Error')) {
        return result + HINT;
      }
      return result;
    } catch (e) {
      return `Error executing ${name}: ${e.message}` + HINT;
    }
  }
}
