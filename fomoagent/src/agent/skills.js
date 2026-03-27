/**
 * Skills loader — reads SKILL.md files from workspace.
 * Mirrors nanobot's agent/skills.py.
 */

import fs from 'node:fs';
import path from 'node:path';

export class SkillsLoader {
  constructor(workspace) {
    this.workspace = workspace;
    this.workspaceSkills = path.join(workspace, 'skills');
  }

  listSkills() {
    const skills = [];
    if (!fs.existsSync(this.workspaceSkills)) return skills;

    for (const entry of fs.readdirSync(this.workspaceSkills, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(this.workspaceSkills, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        skills.push({ name: entry.name, path: skillFile, source: 'workspace' });
      }
    }
    return skills;
  }

  loadSkill(name) {
    const skillFile = path.join(this.workspaceSkills, name, 'SKILL.md');
    if (fs.existsSync(skillFile)) return fs.readFileSync(skillFile, 'utf-8');
    return null;
  }

  getSkillMetadata(name) {
    const content = this.loadSkill(name);
    if (!content || !content.startsWith('---')) return null;

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const metadata = {};
    for (const line of match[1].split('\n')) {
      if (line.includes(':')) {
        const [key, ...rest] = line.split(':');
        metadata[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
      }
    }
    return metadata;
  }

  stripFrontmatter(content) {
    if (!content.startsWith('---')) return content;
    const match = content.match(/^---\n[\s\S]*?\n---\n/);
    return match ? content.slice(match[0].length).trim() : content;
  }

  loadSkillsForContext(skillNames) {
    const parts = [];
    for (const name of skillNames) {
      const content = this.loadSkill(name);
      if (content) {
        parts.push(`### Skill: ${name}\n\n${this.stripFrontmatter(content)}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  getAlwaysSkills() {
    const result = [];
    for (const skill of this.listSkills()) {
      const meta = this.getSkillMetadata(skill.name);
      if (meta?.always === 'true' || meta?.always === true) {
        result.push(skill.name);
      }
    }
    return result;
  }

  buildSkillsSummary() {
    const skills = this.listSkills();
    if (!skills.length) return '';

    const lines = ['<skills>'];
    for (const s of skills) {
      const meta = this.getSkillMetadata(s.name) || {};
      const desc = meta.description || s.name;
      lines.push(`  <skill available="true">`);
      lines.push(`    <name>${s.name}</name>`);
      lines.push(`    <description>${desc}</description>`);
      lines.push(`    <location>${s.path}</location>`);
      lines.push(`  </skill>`);
    }
    lines.push('</skills>');
    return lines.join('\n');
  }
}
