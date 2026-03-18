import { useState, useEffect, useCallback, useRef } from 'react';
import * as queue from '../utils/offline-queue';
import { submitResult, isRetriableError } from '../api/client';
import type { PendingResult } from '../utils/offline-queue';
import type { TestResult } from './useTestingState';

const RETRY_INTERVAL_MS = 10_000;

interface UseOfflineSyncOptions {
  onSynced: (testId: string, result: TestResult) => void;
}

export function useOfflineSync({ onSynced }: UseOfflineSyncOptions) {
  const [pendingResults, setPendingResults] = useState<PendingResult[]>(() =>
    queue.getPendingResults(),
  );
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const hasPending = pendingResults.length > 0;
  const pendingCount = pendingResults.length;

  const addPending = useCallback((result: PendingResult) => {
    queue.addPendingResult(result);
    setPendingResults(queue.getPendingResults());
  }, []);

  // Retry loop with overlap guard
  useEffect(() => {
    if (!hasPending) return;

    let retrying = false;
    const interval = setInterval(async () => {
      if (retrying) return;
      retrying = true;
      try {
        const items = queue.getPendingResults();
        for (const item of items) {
          try {
            const res = await submitResult(item.roundId, {
              testId: item.testId,
              status: item.status,
              description: item.description,
              severity: item.severity,
              commitHash: item.commitHash,
            });
            queue.removePendingResult(item.roundId, item.testId);
            onSyncedRef.current(item.testId, res.data as unknown as TestResult);
          } catch (err) {
            if (isRetriableError(err)) {
              queue.updateRetryCount(item.roundId, item.testId);
            } else {
              // Non-retriable error — remove from queue
              queue.removePendingResult(item.roundId, item.testId);
            }
          }
        }
      } finally {
        retrying = false;
        setPendingResults(queue.getPendingResults());
      }
    }, RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasPending]);

  return {
    pendingResults,
    hasPending,
    pendingCount,
    addPending,
  };
}
