import { useState } from 'react';

interface FailureDialogProps {
  testId: string;
  testTitle: string;
  onSubmit: (data: { severity: string; description: string; createIssue: boolean }) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function FailureDialog({
  testId,
  testTitle,
  onSubmit,
  onCancel,
  submitting,
}: FailureDialogProps) {
  const [severity, setSeverity] = useState('broken');
  const [description, setDescription] = useState('');
  const [createIssue, setCreateIssue] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ severity, description, createIssue });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-1">Report Failure</h3>
        <p className="text-sm text-gray-500 mb-4">
          {testId}: {testTitle}
        </p>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
          <div className="flex gap-2 mb-4">
            {(['minor', 'broken', 'blocker'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                  severity === s
                    ? s === 'blocker'
                      ? 'bg-red-100 border-red-300 text-red-800'
                      : s === 'broken'
                        ? 'bg-orange-100 border-orange-300 text-orange-800'
                        : 'bg-yellow-100 border-yellow-300 text-yellow-800'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? Steps to reproduce..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 h-24 resize-none"
          />

          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
            <input
              type="checkbox"
              checked={createIssue}
              onChange={(e) => setCreateIssue(e.target.checked)}
              className="rounded"
            />
            Create GitHub issue
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Report Failure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
