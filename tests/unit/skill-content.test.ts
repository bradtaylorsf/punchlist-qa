import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = join(__dirname, '../../skills');

function readSkill(platform: string, filename: string): string {
  return readFileSync(join(SKILLS_DIR, platform, filename), 'utf-8');
}

const PLATFORMS = ['claude-code', 'codex'] as const;
const SKILL_FILES = [
  'generate-test-cases.md',
  'update-test-cases.md',
  'qa-assist.md',
  'integrate-widget.md',
] as const;

// Skills that define test case schemas (instructions, category, ID regex)
const TEST_CASE_SKILLS = new Set(['generate-test-cases.md', 'update-test-cases.md']);

describe('skill content', () => {
  for (const platform of PLATFORMS) {
    for (const file of SKILL_FILES) {
      describe(`${platform}/${file}`, () => {
        let content: string;

        // Read once per describe block
        it('file exists and is readable', () => {
          content = readSkill(platform, file);
          expect(content.length).toBeGreaterThan(0);
        });

        it('contains version comment', () => {
          content = readSkill(platform, file);
          expect(content).toContain('<!-- punchlist-skill-version: 1.0.0 -->');
        });

        it('uses correct field name "instructions" (not "steps")', () => {
          content = readSkill(platform, file);
          // The generate and update skills must reference the instructions field
          if (TEST_CASE_SKILLS.has(file)) {
            expect(content).toContain('`instructions`');
          }
          // None of the skills should use the old "steps" array format
          expect(content).not.toMatch(/"steps"\s*:\s*\[/);
        });

        it('uses correct field name "category" (not "module")', () => {
          content = readSkill(platform, file);
          if (TEST_CASE_SKILLS.has(file)) {
            expect(content).toContain('`category`');
          }
          // None of the skills should reference the old "module" field
          expect(content).not.toMatch(/"module"\s*:/);
        });

        it('contains the correct ID regex pattern', () => {
          content = readSkill(platform, file);
          if (TEST_CASE_SKILLS.has(file)) {
            expect(content).toContain('^[a-z][a-z0-9-]*-\\d{3}$');
          }
        });
      });
    }
  }

  describe('generate-test-cases.md specifics', () => {
    for (const platform of PLATFORMS) {
      it(`${platform}: references punchlist.config.json`, () => {
        const content = readSkill(platform, 'generate-test-cases.md');
        expect(content).toContain('punchlist.config.json');
      });
    }
  });

  describe('update-test-cases.md specifics', () => {
    for (const platform of PLATFORMS) {
      it(`${platform}: contains "NEVER change existing test case IDs" warning`, () => {
        const content = readSkill(platform, 'update-test-cases.md');
        expect(content).toContain('NEVER change existing test case IDs');
      });
    }
  });

  describe('qa-assist.md specifics', () => {
    for (const platform of PLATFORMS) {
      it(`${platform}: states it is read-only`, () => {
        const content = readSkill(platform, 'qa-assist.md');
        expect(content).toMatch(/read-only/i);
      });

      it(`${platform}: states it does not modify config`, () => {
        const content = readSkill(platform, 'qa-assist.md');
        expect(content).toMatch(/not\b.*modify/i);
      });
    }
  });

  describe('integrate-widget.md specifics', () => {
    for (const platform of PLATFORMS) {
      it(`${platform}: documents PunchlistWidget.init()`, () => {
        const content = readSkill(platform, 'integrate-widget.md');
        expect(content).toContain('PunchlistWidget.init');
      });

      it(`${platform}: documents all three variants`, () => {
        const content = readSkill(platform, 'integrate-widget.md');
        expect(content).toContain("'fab'");
        expect(content).toContain("'inline'");
        expect(content).toContain("'menu-item'");
      });

      it(`${platform}: documents serverUrl as required`, () => {
        const content = readSkill(platform, 'integrate-widget.md');
        expect(content).toContain('serverUrl');
        expect(content).toMatch(/required/i);
      });

      it(`${platform}: documents CORS setup`, () => {
        const content = readSkill(platform, 'integrate-widget.md');
        expect(content).toContain('corsDomains');
      });
    }
  });

  describe('platform parity', () => {
    for (const file of SKILL_FILES) {
      it(`${file} is identical across platforms`, () => {
        const claude = readSkill('claude-code', file);
        const codex = readSkill('codex', file);
        expect(claude).toBe(codex);
      });
    }
  });
});
