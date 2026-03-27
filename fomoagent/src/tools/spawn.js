import { Tool } from './base.js';

export class SpawnTool extends Tool {
  constructor({ runInBackground, listRuns, maxConcurrent = 4 }) {
    super();
    this.runInBackground = runInBackground;
    this.listRuns = listRuns;
    this.maxConcurrent = maxConcurrent;
  }

  get name() {
    return 'spawn';
  }
  get description() {
    return 'Run an independent background task in another session.';
  }
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'list'] },
        sessionId: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['action'],
    };
  }

  async execute({ action, sessionId = 'api:default', message }) {
    if (action === 'list') {
      return this.listRuns ? this.listRuns() : [];
    }
    if (action !== 'start') return `Error: unsupported action ${action}`;
    if (!message) return 'Error: message is required for spawn start';
    return this.runInBackground({
      sessionId,
      message,
      source: 'spawn',
      maxConcurrent: this.maxConcurrent,
    });
  }
}
