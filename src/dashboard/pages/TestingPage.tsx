import { useState, useMemo } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useAuth } from '../hooks/useAuth';
import { useTestingState } from '../hooks/useTestingState';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { RoundSelector } from '../components/RoundSelector';
import { ProgressBar } from '../components/ProgressBar';
import { FilterBar } from '../components/FilterBar';
import { TestCard } from '../components/TestCard';
import { FailureDialog } from '../components/FailureDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RoundHeader } from '../components/RoundHeader';
import { SyncBanner } from '../components/SyncBanner';
import { exportRoundCSV } from '../utils/csv-export';
import { isRetriableError } from '../api/client';
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
    completeRound,
    updateRoundDetails,
    updateResultIssue,
    setResultSynced,
  } = useTestingState();

  const { user } = useAuth();

  const { pendingCount, addPending } = useOfflineSync({ onSynced: setResultSynced });

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [failingTestId, setFailingTestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);

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
    setSubmitError(null);
    try {
      let commitHash: string | undefined;
      try {
        const commitRes = await api.getCommitSha();
        commitHash = commitRes.data.sha;
      } catch {
        // commit hash is optional
      }
      try {
        await submitTestResult({ testId, status, commitHash });
      } catch (err) {
        if (isRetriableError(err)) {
          addPending({
            roundId: activeRound.id,
            testId,
            status,
            commitHash,
            queuedAt: new Date().toISOString(),
            retryCount: 0,
          });
        } else {
          setSubmitError(err instanceof Error ? err.message : 'Failed to submit result');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFailSubmit(data: {
    severity: string;
    description: string;
    createIssue: boolean;
  }) {
    if (!activeRound || !failingTestId || !config || !user) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let commitHash: string | undefined;
      try {
        const commitRes = await api.getCommitSha();
        commitHash = commitRes.data.sha;
      } catch {}

      try {
        await submitTestResult({
          testId: failingTestId,
          status: 'fail',
          description: data.description || undefined,
          severity: data.severity,
          commitHash,
        });
      } catch (err) {
        if (isRetriableError(err)) {
          addPending({
            roundId: activeRound.id,
            testId: failingTestId,
            status: 'fail',
            description: data.description || undefined,
            severity: data.severity,
            commitHash,
            queuedAt: new Date().toISOString(),
            retryCount: 0,
          });
        } else {
          setSubmitError(err instanceof Error ? err.message : 'Failed to submit result');
          return;
        }
      }

      if (data.createIssue) {
        const tc = config.testCases.find((t) => t.id === failingTestId);
        if (tc) {
          try {
            const issueRes = await api.createIssue({
              testId: tc.id,
              testTitle: tc.title,
              category: tc.category,
              severity: data.severity,
              description: data.description || tc.title,
              testerName: user!.name,
              testerEmail: user!.email,
              commitHash,
              roundName: activeRound.name,
            });
            // Link the issue to the result
            const result = results.get(failingTestId);
            if (result) {
              await updateResultIssue(result.id, failingTestId, issueRes.data.url, issueRes.data.number);
            }
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

  function handleExportCSV() {
    if (!activeRound || !config) return;
    exportRoundCSV(activeRound.name, config.testCases, results, config.categories);
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
        {activeRound ? (
          <RoundHeader
            round={activeRound}
            onSave={updateRoundDetails}
            disabled={activeRound.status === 'completed'}
          />
        ) : (
          <h1 className="text-2xl font-semibold text-gray-900">Testing</h1>
        )}
        <div className="flex items-center gap-3">
          {activeRound && activeRound.status !== 'completed' && (
            <button
              onClick={() => setShowCompleteConfirm(true)}
              className="text-xs px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded border border-green-200"
            >
              Complete Round
            </button>
          )}
          {activeRound && (
            <button
              onClick={handleExportCSV}
              className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded border border-gray-200"
            >
              Export CSV
            </button>
          )}
          <RoundSelector
            rounds={rounds}
            activeRound={activeRound}
            onSelect={selectRound}
            onCreate={async (name) => {
              await createRound(name);
            }}
          />
        </div>
      </div>

      <SyncBanner pendingCount={pendingCount} />

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{submitError}</span>
          <button
            onClick={() => setSubmitError(null)}
            className="text-red-600 hover:text-red-800 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

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

      {showCompleteConfirm && (
        <ConfirmDialog
          title="Complete Round"
          message="Mark this round as completed? No more results can be submitted after this."
          confirmLabel="Complete Round"
          confirmColor="bg-green-600 hover:bg-green-700"
          onConfirm={async () => {
            setCompleting(true);
            try {
              await completeRound();
              setShowCompleteConfirm(false);
            } finally {
              setCompleting(false);
            }
          }}
          onCancel={() => setShowCompleteConfirm(false)}
          submitting={completing}
        />
      )}
    </div>
  );
}
