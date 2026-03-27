/**
 * Base tool class.
 * Mirrors nanobot's agent/tools/base.py.
 */

export class Tool {
  /** @returns {string} */
  get name() { throw new Error('name must be defined'); }

  /** @returns {string} */
  get description() { throw new Error('description must be defined'); }

  /** @returns {object} JSON Schema for parameters */
  get parameters() { return { type: 'object', properties: {} }; }

  /** @param {object} params */
  async execute(params) { throw new Error('execute() must be implemented'); }

  toSchema() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
