import { describe, it, expect } from 'vitest';
import { levenshtein, findClosestMatch } from '../../src/shared/string-utils.js';

describe('levenshtein', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('should return length for empty vs non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('should return 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('should compute single character difference', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('should compute insertion distance', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('should compute deletion distance', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('should compute multi-edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('findClosestMatch', () => {
  const candidates = ['auth', 'checkout', 'settings', 'profile'];

  it('should find exact match', () => {
    expect(findClosestMatch('auth', candidates)).toBe('auth');
  });

  it('should find close match', () => {
    expect(findClosestMatch('auht', candidates)).toBe('auth');
  });

  it('should return null when no candidate is within maxDistance', () => {
    expect(findClosestMatch('zzzzzzzzz', candidates)).toBeNull();
  });

  it('should respect custom maxDistance', () => {
    expect(findClosestMatch('auht', candidates, 2)).toBe('auth');
    expect(findClosestMatch('xyz', candidates, 0)).toBeNull();
  });

  it('should return null for empty candidates', () => {
    expect(findClosestMatch('auth', [])).toBeNull();
  });
});
