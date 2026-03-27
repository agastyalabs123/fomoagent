import { Tool } from './base.js';

export class CronTool extends Tool {
  constructor({ cronService }) {
    super();
    this.cronService = cronService;
  }

  get name() {
    return 'cron';
  }
  get description() {
    return 'Create/manage recurring jobs. Use schedules like "every 30 minutes".';
  }
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'enable', 'disable', 'run_now'] },
        sessionId: { type: 'string' },
        prompt: { type: 'string' },
        schedule: { type: 'string' },
        jobId: { type: 'string' },
      },
      required: ['action'],
    };
  }

  async execute({ action, sessionId, prompt, schedule, jobId }) {
    if (!this.cronService) return 'Error: cron service not configured';
    switch (action) {
      case 'create':
        return this.cronService.addJob({ sessionId, prompt, schedule });
      case 'list':
        return this.cronService.listJobs();
      case 'enable':
        return this.cronService.setEnabled(jobId, true);
      case 'disable':
        return this.cronService.setEnabled(jobId, false);
      case 'run_now':
        return this.cronService.runJobNow(jobId);
      default:
        return `Error: unsupported action ${action}`;
    }
  }
}
