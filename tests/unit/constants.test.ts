import { describe, it, expect } from 'vitest';
import { DEFAULT_PORT, DEFAULT_LABELS, CONFIG_FILENAME, DEFAULT_CONFIG } from '../../src/shared/constants.js';

describe('constants', () => {
  it('should have a default port', () => {
    expect(DEFAULT_PORT).toBe(4747);
  });

  it('should have a config filename', () => {
    expect(CONFIG_FILENAME).toBe('punchlist.config.json');
  });

  it('should have default labels with required fields', () => {
    expect(DEFAULT_LABELS.length).toBeGreaterThan(0);
    for (const label of DEFAULT_LABELS) {
      expect(label).toHaveProperty('name');
      expect(label).toHaveProperty('color');
      expect(label).toHaveProperty('description');
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('should have expected default labels', () => {
    const names = DEFAULT_LABELS.map(l => l.name);
    expect(names).toContain('punchlist');
    expect(names).toContain('qa:fail');
    expect(names).toContain('support');
  });

  it('should have default config values', () => {
    expect(DEFAULT_CONFIG.storage.type).toBe('sqlite');
    expect(DEFAULT_CONFIG.widget.position).toBe('bottom-right');
    expect(DEFAULT_CONFIG.widget.theme).toBe('light');
    expect(DEFAULT_CONFIG.aiTool).toBe('claude-code');
  });
});
