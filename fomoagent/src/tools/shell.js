/**
 * Shell execution tool.
 * Mirrors nanobot's agent/tools/shell.py.
 */

import { exec } from 'node:child_process';
import { Tool } from './base.js';
import { containsInternalUrl } from '../security/network.js';

const DENY_PATTERNS = [
  /\bsudo\b/i,
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /(?:^|[;&|]\s*)format\b/i,
  /\b(mkfs|diskpart)\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/i,
  /\bcurl\b.*\|\s*(sh|bash|zsh)\b/i,
  /\bwget\b.*\|\s*(sh|bash|zsh)\b/i,
];

const MAX_OUTPUT = 10_000;
const MAX_TIMEOUT = 600;

export class ExecTool extends Tool {
  constructor({ workingDir, timeout = 60, restrictToWorkspace = false, pathAppend = '' } = {}) {
    super();
    this._workingDir = workingDir;
    this._timeout = timeout;
    this._restrictToWorkspace = restrictToWorkspace;
    this._pathAppend = pathAppend;
  }

  get name() { return 'exec'; }
  get description() { return 'Execute a shell command and return its output. Use with caution.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        working_dir: { type: 'string', description: 'Optional working directory' },
        timeout: { type: 'integer', description: 'Timeout in seconds (default 60, max 600)', minimum: 1, maximum: 600 },
      },
      required: ['command'],
    };
  }

  async execute({ command, working_dir, timeout }) {
    const cwd = working_dir || this._workingDir || process.cwd();
    const guardError = this._guardCommand(command, cwd);
    if (guardError) return guardError;

    const effectiveTimeout = Math.min(timeout || this._timeout, MAX_TIMEOUT) * 1000;

    const env = { ...process.env };
    if (this._pathAppend) {
      env.PATH = (env.PATH || '') + ':' + this._pathAppend;
    }

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd,
        env,
        timeout: effectiveTimeout,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        const parts = [];
        if (stdout) parts.push(stdout);
        if (stderr?.trim()) parts.push(`STDERR:\n${stderr}`);

        const exitCode = error?.code ?? 0;
        parts.push(`\nExit code: ${exitCode}`);

        let result = parts.join('\n') || '(no output)';

        if (result.length > MAX_OUTPUT) {
          const half = Math.floor(MAX_OUTPUT / 2);
          result = result.slice(0, half) +
            `\n\n... (${result.length - MAX_OUTPUT} chars truncated) ...\n\n` +
            result.slice(-half);
        }

        resolve(result);
      });
    });
  }

  _guardCommand(command, cwd) {
    const lower = command.toLowerCase().trim();

    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(lower)) {
        return 'Error: Command blocked by safety guard (dangerous pattern detected)';
      }
    }

    if (containsInternalUrl(command)) {
      return 'Error: Command blocked by safety guard (internal/private URL detected)';
    }

    if (this._restrictToWorkspace) {
      if (command.includes('../') || command.includes('..\\')) {
        return 'Error: Command blocked by safety guard (path traversal detected)';
      }
    }

    return null;
  }
}
