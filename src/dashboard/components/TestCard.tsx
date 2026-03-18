import { useState } from 'react';
import type { TestResult } from '../hooks/useTestingState';

interface TestCase {
  id: string;
  title: string;
  category: string;
  priority: string;
  instructions: string;
  expectedResult: string;
}

interface TestCardProps {
  testCase: TestCase;
  result?: TestResult;
  onAction: (testId: string, status: string) => void;
  onFail: (testId: string) => void;
  onUndo: (testId: string) => void;
  disabled: boolean;
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<string, string> = {
  pass: 'bg-green-100 border-green-300',
  fail: 'bg-red-50 border-red-300',
  skip: 'bg-yellow-50 border-yellow-300',
  blocked: 'bg-orange-50 border-orange-300',
};

const statusBadgeColors: Record<string, string> = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  skip: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-orange-100 text-orange-800',
};

export function TestCard({ testCase, result, onAction, onFail, onUndo, disabled }: TestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = !!result;
  const borderClass = result ? statusColors[result.status] || '' : 'border-gray-200';

  return (
    <div className={`border rounded-lg p-4 ${borderClass}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs text-gray-500">{testCase.id}</code>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[testCase.priority] || ''}`}
            >
              {testCase.priority}
            </span>
            {result && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusBadgeColors[result.status] || ''}`}
              >
                {result.status}
                {result.severity ? ` (${result.severity})` : ''}
              </span>
            )}
            {result?.issueUrl && (
              <a
                href={result.issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                #{result.issueNumber}
              </a>
            )}
          </div>
          <h3
            className="text-sm font-medium text-gray-900 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            {testCase.title}
          </h3>
        </div>

        <div className="flex items-center gap-1 ml-4 shrink-0">
          {hasResult ? (
            <button
              onClick={() => onUndo(testCase.id)}
              disabled={disabled}
              className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
            >
              Undo
            </button>
          ) : (
            <>
              <button
                onClick={() => onAction(testCase.id, 'pass')}
                disabled={disabled}
                className="text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded border border-green-200 disabled:opacity-50"
              >
                Pass
              </button>
              <button
                onClick={() => onFail(testCase.id)}
                disabled={disabled}
                className="text-xs px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded border border-red-200 disabled:opacity-50"
              >
                Fail
              </button>
              <button
                onClick={() => onAction(testCase.id, 'skip')}
                disabled={disabled}
                className="text-xs px-2.5 py-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded border border-yellow-200 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={() => onAction(testCase.id, 'blocked')}
                disabled={disabled}
                className="text-xs px-2.5 py-1 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded border border-orange-200 disabled:opacity-50"
              >
                Blocked
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 text-sm text-gray-600 space-y-2 border-t border-gray-200 pt-3">
          <div>
            <span className="font-medium text-gray-700">Instructions: </span>
            {testCase.instructions}
          </div>
          <div>
            <span className="font-medium text-gray-700">Expected: </span>
            {testCase.expectedResult}
          </div>
          {result?.description && (
            <div>
              <span className="font-medium text-gray-700">Notes: </span>
              {result.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
