import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPendingResults,
  addPendingResult,
  removePendingResult,
  updateRetryCount,
  clearAll,
  MAX_RETRIES,
} from '../../src/dashboard/utils/offline-queue';
import type { PendingResult } from '../../src/dashboard/utils/offline-queue';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};

vi.stubGlobal('localStorage', localStorageMock);

function makePending(overrides: Partial<PendingResult> = {}): PendingResult {
  return {
    roundId: 'round-1',
    testId: 'auth-001',
    status: 'fail',
    queuedAt: '2026-03-18T00:00:00Z',
    retryCount: 0,
    ...overrides,
  };
}

describe('offline-queue', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.clearAllMocks();
  });

  it('returns empty array when nothing stored', () => {
    expect(getPendingResults()).toEqual([]);
  });

  it('adds and retrieves pending results', () => {
    const p = makePending();
    addPendingResult(p);
    const results = getPendingResults();
    expect(results).toHaveLength(1);
    expect(results[0].testId).toBe('auth-001');
  });

  it('deduplicates by roundId + testId', () => {
    addPendingResult(makePending({ status: 'fail' }));
    addPendingResult(makePending({ status: 'pass' }));
    const results = getPendingResults();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('pass');
  });

  it('allows different testIds in same round', () => {
    addPendingResult(makePending({ testId: 'auth-001' }));
    addPendingResult(makePending({ testId: 'auth-002' }));
    expect(getPendingResults()).toHaveLength(2);
  });

  it('removes specific pending result', () => {
    addPendingResult(makePending({ testId: 'auth-001' }));
    addPendingResult(makePending({ testId: 'auth-002' }));
    removePendingResult('round-1', 'auth-001');
    const results = getPendingResults();
    expect(results).toHaveLength(1);
    expect(results[0].testId).toBe('auth-002');
  });

  it('no-ops when removing non-existent result', () => {
    addPendingResult(makePending());
    removePendingResult('round-1', 'nonexistent');
    expect(getPendingResults()).toHaveLength(1);
  });

  it('increments retry count', () => {
    addPendingResult(makePending());
    updateRetryCount('round-1', 'auth-001');
    expect(getPendingResults()[0].retryCount).toBe(1);
    updateRetryCount('round-1', 'auth-001');
    expect(getPendingResults()[0].retryCount).toBe(2);
  });

  it('clears all pending results', () => {
    addPendingResult(makePending({ testId: 'auth-001' }));
    addPendingResult(makePending({ testId: 'auth-002' }));
    clearAll();
    expect(getPendingResults()).toEqual([]);
  });

  it('handles corrupted localStorage gracefully', () => {
    store['punchlist_pending_results'] = 'not json';
    expect(getPendingResults()).toEqual([]);
  });

  it('drops items that exceed max retries', () => {
    addPendingResult(makePending({ retryCount: MAX_RETRIES - 1 }));
    expect(getPendingResults()).toHaveLength(1);
    updateRetryCount('round-1', 'auth-001');
    expect(getPendingResults()).toHaveLength(0);
  });

  it('rejects malformed localStorage data via Zod validation', () => {
    store['punchlist_pending_results'] = JSON.stringify([{ bad: 'data' }]);
    expect(getPendingResults()).toEqual([]);
  });
});
