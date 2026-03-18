import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache } from '../../src/adapters/issues/cache.js';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return undefined for missing keys', () => {
    const cache = new TTLCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should return value before TTL expires', () => {
    const cache = new TTLCache<string>(5000);
    cache.set('key', 'value');

    vi.advanceTimersByTime(4000);
    expect(cache.get('key')).toBe('value');
  });

  it('should return undefined after TTL expires', () => {
    const cache = new TTLCache<string>(5000);
    cache.set('key', 'value');

    vi.advanceTimersByTime(6000);
    expect(cache.get('key')).toBeUndefined();
  });

  it('should store null values correctly', () => {
    const cache = new TTLCache<string | null>(5000);
    cache.set('key', null);
    expect(cache.get('key')).toBeNull();
  });

  it('should invalidate a specific key', () => {
    const cache = new TTLCache<string>(5000);
    cache.set('a', 'one');
    cache.set('b', 'two');

    cache.invalidate('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('two');
  });

  it('should clear all keys', () => {
    const cache = new TTLCache<string>(5000);
    cache.set('a', 'one');
    cache.set('b', 'two');

    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('should overwrite existing keys', () => {
    const cache = new TTLCache<string>(5000);
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
  });

  it('should use default TTL of 5 minutes', () => {
    const cache = new TTLCache<string>();
    cache.set('key', 'value');

    vi.advanceTimersByTime(4 * 60 * 1000); // 4 minutes
    expect(cache.get('key')).toBe('value');

    vi.advanceTimersByTime(2 * 60 * 1000); // 6 minutes total
    expect(cache.get('key')).toBeUndefined();
  });

  it('should evict oldest entry when maxSize is reached', () => {
    const cache = new TTLCache<string>(5000, 2);
    cache.set('a', 'one');
    cache.set('b', 'two');
    cache.set('c', 'three'); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('two');
    expect(cache.get('c')).toBe('three');
    expect(cache.size).toBe(2);
  });

  it('should not evict when updating an existing key at maxSize', () => {
    const cache = new TTLCache<string>(5000, 2);
    cache.set('a', 'one');
    cache.set('b', 'two');
    cache.set('a', 'updated'); // update existing, no eviction

    expect(cache.get('a')).toBe('updated');
    expect(cache.get('b')).toBe('two');
    expect(cache.size).toBe(2);
  });

  it('should report size correctly', () => {
    const cache = new TTLCache<string>(5000);
    expect(cache.size).toBe(0);
    cache.set('a', 'one');
    expect(cache.size).toBe(1);
    cache.set('b', 'two');
    expect(cache.size).toBe(2);
    cache.invalidate('a');
    expect(cache.size).toBe(1);
  });
});
