/**
 * Filesystem tools: read_file, write_file, edit_file, list_dir.
 * Mirrors nanobot's agent/tools/filesystem.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Tool } from './base.js';

function resolvePath(filePath, workspace, allowedDir) {
  let p = filePath;
  if (p.startsWith('~')) p = p.replace('~', process.env.HOME || '');
  if (!path.isAbsolute(p) && workspace) p = path.join(workspace, p);
  p = path.resolve(p);
  if (allowedDir) {
    const resolved = path.resolve(allowedDir);
    if (!p.startsWith(resolved + path.sep) && p !== resolved) {
      throw new Error(`Path ${filePath} is outside allowed directory ${allowedDir}`);
    }
  }
  return p;
}

export class ReadFileTool extends Tool {
  constructor({ workspace, allowedDir } = {}) {
    super();
    this._workspace = workspace;
    this._allowedDir = allowedDir;
  }

  get name() { return 'read_file'; }
  get description() { return 'Read the contents of a file. Returns numbered lines. Use offset and limit for large files.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        offset: { type: 'integer', description: 'Line number to start (1-indexed, default 1)', minimum: 1 },
        limit: { type: 'integer', description: 'Max lines to read (default 2000)', minimum: 1 },
      },
      required: ['path'],
    };
  }

  async execute({ path: filePath, offset = 1, limit = 2000 }) {
    try {
      if (!filePath) return 'Error reading file: Unknown path';
      const fp = resolvePath(filePath, this._workspace, this._allowedDir);
      if (!fs.existsSync(fp)) return `Error: File not found: ${filePath}`;
      const stat = fs.statSync(fp);
      if (!stat.isFile()) return `Error: Not a file: ${filePath}`;

      const content = fs.readFileSync(fp, 'utf-8');
      if (!content) return `(Empty file: ${filePath})`;

      const lines = content.split('\n');
      const total = lines.length;
      if (offset > total) return `Error: offset ${offset} is beyond end of file (${total} lines)`;

      const start = offset - 1;
      const end = Math.min(start + limit, total);
      const numbered = lines.slice(start, end).map((line, i) => `${start + i + 1}| ${line}`);
      let result = numbered.join('\n');

      // Truncate if too large
      if (result.length > 128_000) {
        result = result.slice(0, 128_000) + '\n... (truncated)';
      }

      if (end < total) {
        result += `\n\n(Showing lines ${offset}-${end} of ${total}. Use offset=${end + 1} to continue.)`;
      } else {
        result += `\n\n(End of file — ${total} lines total)`;
      }
      return result;
    } catch (e) {
      return `Error reading file: ${e.message}`;
    }
  }
}

export class WriteFileTool extends Tool {
  constructor({ workspace, allowedDir } = {}) {
    super();
    this._workspace = workspace;
    this._allowedDir = allowedDir;
  }

  get name() { return 'write_file'; }
  get description() { return 'Write content to a file. Creates parent directories if needed.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    };
  }

  async execute({ path: filePath, content }) {
    try {
      if (!filePath) return 'Error: Unknown path';
      if (content == null) return 'Error: Unknown content';
      const fp = resolvePath(filePath, this._workspace, this._allowedDir);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${fp}`;
    } catch (e) {
      return `Error writing file: ${e.message}`;
    }
  }
}

export class EditFileTool extends Tool {
  constructor({ workspace, allowedDir } = {}) {
    super();
    this._workspace = workspace;
    this._allowedDir = allowedDir;
  }

  get name() { return 'edit_file'; }
  get description() { return 'Edit a file by replacing old_text with new_text. Set replace_all=true for all occurrences.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        old_text: { type: 'string', description: 'Text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['path', 'old_text', 'new_text'],
    };
  }

  async execute({ path: filePath, old_text, new_text, replace_all = false }) {
    try {
      if (!filePath) return 'Error: Unknown path';
      if (old_text == null || new_text == null) return 'Error: Missing old_text or new_text';
      const fp = resolvePath(filePath, this._workspace, this._allowedDir);
      if (!fs.existsSync(fp)) return `Error: File not found: ${filePath}`;

      let content = fs.readFileSync(fp, 'utf-8');
      const count = content.split(old_text).length - 1;

      if (count === 0) {
        // Try trimmed match
        const oldLines = old_text.split('\n').map(l => l.trim());
        const contentLines = content.split('\n');
        let found = false;
        for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
          const window = contentLines.slice(i, i + oldLines.length);
          if (window.every((l, j) => l.trim() === oldLines[j])) {
            const matched = window.join('\n');
            content = content.replace(matched, new_text);
            found = true;
            break;
          }
        }
        if (!found) return `Error: old_text not found in ${filePath}. Verify the file content.`;
      } else if (count > 1 && !replace_all) {
        return `Warning: old_text appears ${count} times. Provide more context or set replace_all=true.`;
      } else {
        content = replace_all ? content.replaceAll(old_text, new_text) : content.replace(old_text, new_text);
      }

      fs.writeFileSync(fp, content, 'utf-8');
      return `Successfully edited ${fp}`;
    } catch (e) {
      return `Error editing file: ${e.message}`;
    }
  }
}

export class ListDirTool extends Tool {
  constructor({ workspace, allowedDir } = {}) {
    super();
    this._workspace = workspace;
    this._allowedDir = allowedDir;
  }

  static IGNORE = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.tox']);

  get name() { return 'list_dir'; }
  get description() { return 'List directory contents. Set recursive=true for nested structure.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        recursive: { type: 'boolean', description: 'Recursively list (default false)' },
        max_entries: { type: 'integer', description: 'Max entries (default 200)', minimum: 1 },
      },
      required: ['path'],
    };
  }

  async execute({ path: dirPath, recursive = false, max_entries = 200 }) {
    try {
      if (!dirPath) return 'Error: Unknown path';
      const dp = resolvePath(dirPath, this._workspace, this._allowedDir);
      if (!fs.existsSync(dp)) return `Error: Directory not found: ${dirPath}`;
      if (!fs.statSync(dp).isDirectory()) return `Error: Not a directory: ${dirPath}`;

      const items = [];
      const cap = max_entries || 200;

      if (recursive) {
        const walk = (dir, prefix = '') => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (ListDirTool.IGNORE.has(entry.name)) continue;
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (items.length < cap) items.push(entry.isDirectory() ? `${rel}/` : rel);
            if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
          }
        };
        walk(dp);
      } else {
        for (const entry of fs.readdirSync(dp, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (ListDirTool.IGNORE.has(entry.name)) continue;
          if (items.length < cap) items.push(entry.isDirectory() ? `📁 ${entry.name}` : `📄 ${entry.name}`);
        }
      }

      if (!items.length) return `Directory ${dirPath} is empty`;
      return items.join('\n');
    } catch (e) {
      return `Error listing directory: ${e.message}`;
    }
  }
}
