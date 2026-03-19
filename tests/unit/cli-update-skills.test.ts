import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test copySkills directly since updateSkillsCommand depends on process.cwd() and loadConfig
import { copySkills } from '../../src/cli/commands/init.js';

describe('copySkills', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'punchlist-skills-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('copies claude-code skills to .claude/skills/', () => {
    copySkills('claude-code', tempDir);
    const targetDir = join(tempDir, '.claude', 'skills');
    expect(existsSync(targetDir)).toBe(true);
    const files = readdirSync(targetDir);
    expect(files).toContain('generate-test-cases.md');
    expect(files).toContain('update-test-cases.md');
    expect(files).toContain('qa-assist.md');
  });

  it('copies codex skills to .codex/skills/', () => {
    copySkills('codex', tempDir);
    const targetDir = join(tempDir, '.codex', 'skills');
    expect(existsSync(targetDir)).toBe(true);
    const files = readdirSync(targetDir);
    expect(files).toContain('generate-test-cases.md');
    expect(files).toContain('update-test-cases.md');
    expect(files).toContain('qa-assist.md');
  });

  it('copies to both dirs when called for both platforms', () => {
    copySkills('claude-code', tempDir);
    copySkills('codex', tempDir);
    expect(existsSync(join(tempDir, '.claude', 'skills'))).toBe(true);
    expect(existsSync(join(tempDir, '.codex', 'skills'))).toBe(true);
    // Both should have the same files
    const claudeFiles = readdirSync(join(tempDir, '.claude', 'skills')).sort();
    const codexFiles = readdirSync(join(tempDir, '.codex', 'skills')).sort();
    expect(claudeFiles).toEqual(codexFiles);
  });

  it('is idempotent — can run twice without error', () => {
    copySkills('claude-code', tempDir);
    const firstFiles = readdirSync(join(tempDir, '.claude', 'skills')).sort();

    // Run again — should not throw
    copySkills('claude-code', tempDir);
    const secondFiles = readdirSync(join(tempDir, '.claude', 'skills')).sort();

    expect(firstFiles).toEqual(secondFiles);
  });

  it('creates target directory if it does not exist', () => {
    const targetDir = join(tempDir, '.claude', 'skills');
    expect(existsSync(targetDir)).toBe(false);
    copySkills('claude-code', tempDir);
    expect(existsSync(targetDir)).toBe(true);
  });
});
