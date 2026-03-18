import { useState, useMemo } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useTestingState } from '../hooks/useTestingState';
import { RoundSelector } from '../components/RoundSelector';
import { ProgressBar } from '../components/ProgressBar';
import { FilterBar } from '../components/FilterBar';
import { TestCard } from '../components/TestCard';
import { FailureDialog } from '../components/FailureDialog';
import * as api from '../api/client';

export function TestingPage() {
  const { config, loading: configLoading } = useConfig();
  const {
    rounds,
    activeRound,
    results,
    loading: roundsLoading,
    createRound,
    selectRound,
    submitTestResult,
    undoResult,
  } = useTestingState();

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [failingTestId, setFailingTestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Progress stats
  const stats = useMemo(() => {
    if (!config) return { pass: 0, fail: 0, skip: 0, blocked: 0 };
    let pass = 0,
      fail = 0,
      skip = 0,
      blocked = 0;
    for (const r of results.values()) {
      if (r.status === 'pass') pass++;
      else if (r.status === 'fail') fail++;
      else if (r.status === 'skip') skip++;
      else if (r.status === 'blocked') blocked++;
    }
    return { pass, fail, skip, blocked };
  }, [results, config]);

  // Filter test cases
  const filteredTests = useMemo(() => {
    if (!config) return [];
    return config.testCases.filter((tc) => {
      if (categoryFilter !== 'all' && tc.category !== categoryFilter) return false;
      if (statusFilter === 'untested') return !results.has(tc.id);
      if (statusFilter !== 'all') {
        const r = results.get(tc.id);
        if (!r || r.status !== statusFilter) return false;
      }
      return true;
    });
  }, [config, categoryFilter, statusFilter, results]);

  // Group by category
  const groupedTests = useMemo(() => {
    const groups = new Map<string, typeof filteredTests>();
    for (const tc of filteredTests) {
      const list = groups.get(tc.category) || [];
      list.push(tc);
      groups.set(tc.category, list);
    }
    return groups;
  }, [filteredTests]);

  async function handleAction(testId: string, status: string) {
    if (!activeRound) return;
    setSubmitting(true);
    try {
      let commitHash: string | undefined;
      try {
        const commitRes = await api.getCommitSha();
        commitHash = commitRes.data.sha;
      } catch {
        // commit hash is optional
      }
      await submitTestResult({ testId, status, commitHash });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFailSubmit(data: {
    severity: string;
    description: string;
    createIssue: boolean;
  }) {
    if (!activeRound || !failingTestId || !config) return;
    setSubmitting(true);
    try {
      let commitHash: string | undefined;
      try {
        const commitRes = await api.getCommitSha();
        commitHash = commitRes.data.sha;
      } catch {}

      await submitTestResult({
        testId: failingTestId,
        status: 'fail',
        description: data.description || undefined,
        severity: data.severity,
        commitHash,
      });

      if (data.createIssue) {
        const tc = config.testCases.find((t) => t.id === failingTestId);
        if (tc) {
          try {
            await api.createIssue({
              testId: tc.id,
              testTitle: tc.title,
              category: tc.category,
              severity: data.severity,
              description: data.description || tc.title,
              testerName: 'tester',
              testerEmail: 'tester@test.com',
              commitHash,
              roundName: activeRound.name,
            });
          } catch {
            // Issue creation is best-effort
          }
        }
      }

      setFailingTestId(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (configLoading || roundsLoading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (!config) {
    return <p className="text-red-500">Failed to load configuration.</p>;
  }

  const categoryMap = new Map(config.categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Testing</h1>
        <RoundSelector
          rounds={rounds}
          activeRound={activeRound}
          onSelect={selectRound}
          onCreate={async (name) => {
            await createRound(name);
          }}
        />
      </div>

      {!activeRound ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No active test round. Create one to start testing.</p>
        </div>
      ) : (
        <>
          <ProgressBar
            total={config.testCases.length}
            pass={stats.pass}
            fail={stats.fail}
            skip={stats.skip}
            blocked={stats.blocked}
          />

          <FilterBar
            categories={config.categories}
            selectedCategory={categoryFilter}
            selectedStatus={statusFilter}
            onCategoryChange={setCategoryFilter}
            onStatusChange={setStatusFilter}
          />

          <div className="space-y-8">
            {[...groupedTests.entries()].map(([categoryId, tests]) => {
              const category = categoryMap.get(categoryId);
              return (
                <div key={categoryId}>
                  <h2 className="text-lg font-medium text-gray-800 mb-3">
                    {category?.label || categoryId}
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      ({tests.length} test{tests.length !== 1 ? 's' : ''})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {tests.map((tc) => (
                      <TestCard
                        key={tc.id}
                        testCase={tc}
                        result={results.get(tc.id)}
                        onAction={handleAction}
                        onFail={setFailingTestId}
                        onUndo={undoResult}
                        disabled={submitting || activeRound.status === 'completed'}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredTests.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              No test cases match the current filters.
            </p>
          )}
        </>
      )}

      {failingTestId && (
        <FailureDialog
          testId={failingTestId}
          testTitle={config.testCases.find((t) => t.id === failingTestId)?.title || ''}
          onSubmit={handleFailSubmit}
          onCancel={() => setFailingTestId(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
