import { useState } from 'react';
import type { Round } from '../hooks/useTestingState';

interface RoundSelectorProps {
  rounds: Round[];
  activeRound: Round | null;
  onSelect: (roundId: string) => void;
  onCreate: (name: string, description?: string) => Promise<void>;
}

export function RoundSelector({ rounds, activeRound, onSelect, onCreate }: RoundSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(name.trim());
      setName('');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={activeRound?.id ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white"
      >
        <option value="" disabled>
          Select a round...
        </option>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} {r.status === 'completed' ? '(completed)' : ''}
          </option>
        ))}
      </select>
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
        >
          New Round
        </button>
      ) : (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Round name"
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5"
            autoFocus
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
