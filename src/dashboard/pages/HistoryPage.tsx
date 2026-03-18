import { useState, useEffect } from 'react';
import * as api from '../api/client';
import type { Round, TestResult } from '../hooks/useTestingState';

export function HistoryPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
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
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(round.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {round.completedAt
                      ? new Date(round.completedAt).toLocaleDateString()
                      : '-'}
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
                  {new Date(selectedRound.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[selectedRound.status] || ''}`}
              >
                {selectedRound.status}
              </span>
            </div>
          </div>

          {results.length === 0 ? (
            <p className="text-gray-500">No results recorded for this round.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Test ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Severity</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Tester</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Issue</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-mono text-gray-900">{r.testId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${resultBadge[r.status] || ''}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.severity || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.testerName}</td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
