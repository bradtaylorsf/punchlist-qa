import { useState, useEffect, useMemo } from 'react';
import * as api from '../api/client';
import { useConfig } from '../hooks/useConfig';
import { ProgressBar } from '../components/ProgressBar';
import { exportRoundCSV } from '../utils/csv-export';
import type { Round, TestResult } from '../hooks/useTestingState';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusBadge: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
};

const resultBadge: Record<string, string> = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  skip: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-orange-100 text-orange-800',
};

function ResultsTable({
  results,
  resolveTitle,
}: {
  results: TestResult[];
  resolveTitle: (testId: string) => { title: string; isOrphaned: boolean };
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Test</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Status</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Tester</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Notes</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Issue</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const { title, isOrphaned } = resolveTitle(r.testId);
            return (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="px-4 py-2">
                  {isOrphaned ? (
                    <>
                      <code className="text-xs text-gray-500">{r.testId}</code>
                      <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                        Removed Test
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-gray-900">{title}</div>
                      <code className="text-xs text-gray-400">{r.testId}</code>
                    </>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${resultBadge[r.status] || ''}`}
                  >
                    {r.status}
                    {r.severity ? ` (${r.severity})` : ''}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{r.testerName}</td>
                <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                  {r.description || '-'}
                </td>
                <td className="px-4 py-2">
                  {r.issueUrl ? (
                    <a
                      href={r.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      #{r.issueNumber}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const { config } = useConfig();

  useEffect(() => {
    api
      .listRounds()
      .then((res) => setRounds(res.data as unknown as Round[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRound) {
      setResults([]);
      return;
    }
    api
      .listResults(selectedRound.id)
      .then((res) => setResults(res.data as unknown as TestResult[]))
      .catch(() => {});
  }, [selectedRound?.id]);

  // Build lookup map from config
  const testCaseMap = useMemo(() => {
    if (!config) return new Map<string, { title: string; category: string }>();
    return new Map(config.testCases.map((tc) => [tc.id, { title: tc.title, category: tc.category }]));
  }, [config]);

  const categoryMap = useMemo(() => {
    if (!config) return new Map<string, string>();
    return new Map(config.categories.map((c) => [c.id, c.label]));
  }, [config]);

  // Group results by category for drill-in
  const { grouped, orphaned, stats } = useMemo(() => {
    const groups = new Map<string, TestResult[]>();
    const orphanedResults: TestResult[] = [];
    let pass = 0,
      fail = 0,
      skip = 0,
      blocked = 0;

    for (const r of results) {
      if (r.status === 'pass') pass++;
      else if (r.status === 'fail') fail++;
      else if (r.status === 'skip') skip++;
      else if (r.status === 'blocked') blocked++;

      const tc = testCaseMap.get(r.testId);
      if (!tc) {
        orphanedResults.push(r);
        continue;
      }
      const list = groups.get(tc.category) || [];
      list.push(r);
      groups.set(tc.category, list);
    }

    return {
      grouped: groups,
      orphaned: orphanedResults,
      stats: { pass, fail, skip, blocked },
    };
  }, [results, testCaseMap]);

  function resolveTitle(testId: string): { title: string; isOrphaned: boolean } {
    const tc = testCaseMap.get(testId);
    if (tc) return { title: tc.title, isOrphaned: false };
    return { title: testId, isOrphaned: true };
  }

  function handleExportCSV() {
    if (!selectedRound || !config) return;
    const resultsMap = new Map(results.map((r) => [r.testId, r]));
    exportRoundCSV(selectedRound.name, config.testCases, resultsMap, config.categories);
  }

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">History</h1>

      {rounds.length === 0 ? (
        <p className="text-gray-500">No test rounds yet.</p>
      ) : !selectedRound ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Round</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Created By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Completed</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr
                  key={round.id}
                  onClick={() => setSelectedRound(round)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{round.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[round.status] || ''}`}
                    >
                      {round.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{round.createdByName}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(round.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {round.completedAt ? formatDate(round.completedAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setSelectedRound(null)}
            className="text-sm text-blue-600 hover:underline mb-4"
          >
            Back to all rounds
          </button>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">{selectedRound.name}</h2>
                <p className="text-sm text-gray-500">
                  Created by {selectedRound.createdByName} on{' '}
                  {formatDate(selectedRound.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {config && results.length > 0 && (
                  <button
                    onClick={handleExportCSV}
                    className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded border border-gray-200"
                  >
                    Export CSV
                  </button>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[selectedRound.status] || ''}`}
                >
                  {selectedRound.status}
                </span>
              </div>
            </div>
          </div>

          {results.length > 0 && config && (
            <div className="mb-4">
              <ProgressBar
                total={config.testCases.length}
                pass={stats.pass}
                fail={stats.fail}
                skip={stats.skip}
                blocked={stats.blocked}
              />
            </div>
          )}

          {results.length === 0 ? (
            <p className="text-gray-500">No results recorded for this round.</p>
          ) : (
            <div className="space-y-6">
              {[...grouped.entries()].map(([categoryId, categoryResults]) => (
                <div key={categoryId}>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    {categoryMap.get(categoryId) || categoryId}
                    <span className="text-gray-400 font-normal ml-2">
                      ({categoryResults.length} result{categoryResults.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <ResultsTable results={categoryResults} resolveTitle={resolveTitle} />
                </div>
              ))}

              {orphaned.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Removed Tests
                    <span className="text-gray-400 font-normal ml-2">
                      ({orphaned.length} result{orphaned.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <ResultsTable results={orphaned} resolveTitle={resolveTitle} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
