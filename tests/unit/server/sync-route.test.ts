import { describe, it, expect } from 'vitest';
import { diffById } from '../../../src/server/routes/sync.js';

describe('sync diffById', () => {
  it('detects added items', () => {
    const incoming = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const existing: typeof incoming = [];
    const diff = diffById(incoming, existing);

    expect(diff.added).toEqual(incoming);
    expect(diff.updated).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects removed items', () => {
    const incoming: Array<{ id: string; label: string }> = [];
    const existing = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const diff = diffById(incoming, existing);

    expect(diff.added).toEqual([]);
    expect(diff.updated).toEqual([]);
    expect(diff.removed).toEqual(existing);
  });

  it('detects updated items', () => {
    const incoming = [{ id: 'a', label: 'Updated A' }];
    const existing = [{ id: 'a', label: 'A' }];
    const diff = diffById(incoming, existing);

    expect(diff.added).toEqual([]);
    expect(diff.updated).toEqual([{ id: 'a', label: 'Updated A' }]);
    expect(diff.removed).toEqual([]);
  });

  it('detects unchanged items as no diff', () => {
    const items = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const diff = diffById(items, items);

    expect(diff.added).toEqual([]);
    expect(diff.updated).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('handles mixed add/update/remove', () => {
    const incoming = [
      { id: 'a', label: 'Updated A' },
      { id: 'c', label: 'New C' },
    ];
    const existing = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const diff = diffById(incoming, existing);

    expect(diff.added).toEqual([{ id: 'c', label: 'New C' }]);
    expect(diff.updated).toEqual([{ id: 'a', label: 'Updated A' }]);
    expect(diff.removed).toEqual([{ id: 'b', label: 'B' }]);
  });

  it('works with complex objects (test cases)', () => {
    const incoming = [
      { id: 'auth-001', title: 'Login', category: 'auth', priority: 'high', instructions: 'Try login', expectedResult: 'Works' },
      { id: 'auth-002', title: 'Logout', category: 'auth', priority: 'medium', instructions: 'Click logout', expectedResult: 'Logged out' },
    ];
    const existing = [
      { id: 'auth-001', title: 'Login', category: 'auth', priority: 'medium', instructions: 'Try login', expectedResult: 'Works' },
    ];
    const diff = diffById(incoming, existing);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0].id).toBe('auth-002');
    expect(diff.updated.length).toBe(1);
    expect(diff.updated[0].id).toBe('auth-001');
    expect(diff.updated[0].priority).toBe('high');
    expect(diff.removed.length).toBe(0);
  });
});
