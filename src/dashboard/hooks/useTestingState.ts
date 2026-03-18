import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';

export interface Round {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TestResult {
  id: string;
  roundId: string;
  testId: string;
  status: string;
  testerName: string;
  testerEmail: string;
  description: string | null;
  severity: string | null;
  commitHash: string | null;
  issueUrl: string | null;
  issueNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export function useTestingState() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeRound, setActiveRound] = useState<Round | null>(null);
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [loading, setLoading] = useState(true);

  // Load rounds on mount
  useEffect(() => {
    api
      .listRounds()
      .then((res) => {
        const data = res.data as unknown as Round[];
        setRounds(data);
        // Auto-select the first active round
        const active = data.find((r) => r.status === 'active');
        if (active) setActiveRound(active);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load results when active round changes
  useEffect(() => {
    if (!activeRound) {
      setResults(new Map());
      return;
    }
    api
      .listResults(activeRound.id)
      .then((res) => {
        const map = new Map<string, TestResult>();
        for (const r of res.data as unknown as TestResult[]) {
          map.set(r.testId, r);
        }
        setResults(map);
      })
      .catch(() => {});
  }, [activeRound?.id]);

  const createRound = useCallback(async (name: string, description?: string) => {
    const res = await api.createRound({ name, description });
    const round = res.data as unknown as Round;
    setRounds((prev) => [round, ...prev]);
    setActiveRound(round);
    return round;
  }, []);

  const selectRound = useCallback(
    (roundId: string) => {
      const round = rounds.find((r) => r.id === roundId);
      if (round) setActiveRound(round);
    },
    [rounds],
  );

  const submitTestResult = useCallback(
    async (input: {
      testId: string;
      status: string;
      description?: string;
      severity?: string;
      commitHash?: string;
    }) => {
      if (!activeRound) return;
      const res = await api.submitResult(activeRound.id, input);
      const result = res.data as unknown as TestResult;
      setResults((prev) => new Map(prev).set(result.testId, result));
      return result;
    },
    [activeRound],
  );

  const undoResult = useCallback(
    async (testId: string) => {
      if (!activeRound) return;
      await api.deleteResult(activeRound.id, testId);
      setResults((prev) => {
        const next = new Map(prev);
        next.delete(testId);
        return next;
      });
    },
    [activeRound],
  );

  const completeRound = useCallback(async () => {
    if (!activeRound) return;
    const res = await api.updateRound(activeRound.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    const updated = res.data as unknown as Round;
    setActiveRound(updated);
    setRounds((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, [activeRound]);

  const setResultSynced = useCallback((testId: string, result: TestResult) => {
    setResults((prev) => new Map(prev).set(testId, result));
  }, []);

  return {
    rounds,
    activeRound,
    results,
    loading,
    createRound,
    selectRound,
    submitTestResult,
    undoResult,
    completeRound,
    setResultSynced,
  };
}
