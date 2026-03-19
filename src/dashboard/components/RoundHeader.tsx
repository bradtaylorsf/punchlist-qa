import { useState, useRef, useEffect } from 'react';

interface RoundHeaderProps {
  round: { name: string; description: string | null };
  onSave: (input: { name?: string; description?: string | null }) => Promise<void>;
  disabled?: boolean;
}

export function RoundHeader({ round, onSave, disabled = false }: RoundHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState(round.name);
  const [description, setDescription] = useState(round.description || '');
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(round.name);
    setDescription(round.description || '');
  }, [round.name, round.description]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  async function saveName() {
    if (!editingName) return;
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === round.name) {
      setName(round.name);
      return;
    }
    try {
      await onSave({ name: trimmed });
    } catch {
      setName(round.name);
    }
  }

  async function saveDescription() {
    if (!editingDesc) return;
    setEditingDesc(false);
    const trimmed = description.trim();
    const current = round.description || '';
    if (trimmed === current) return;
    try {
      await onSave({ description: trimmed || null });
    } catch {
      setDescription(round.description || '');
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') {
      setName(round.name);
      setEditingName(false);
    }
  }

  function handleDescKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveDescription();
    if (e.key === 'Escape') {
      setDescription(round.description || '');
      setEditingDesc(false);
    }
  }

  return (
    <div>
      {editingName ? (
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={handleNameKeyDown}
          className="text-2xl font-semibold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent w-full"
        />
      ) : (
        <h1
          className={`text-2xl font-semibold text-gray-900 ${!disabled ? 'cursor-pointer hover:text-blue-600' : ''}`}
          onClick={() => !disabled && setEditingName(true)}
          title={!disabled ? 'Click to edit' : undefined}
        >
          {round.name}
        </h1>
      )}
      {editingDesc ? (
        <input
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          onKeyDown={handleDescKeyDown}
          placeholder="Add a description..."
          className="text-sm text-gray-500 border-b border-blue-400 outline-none bg-transparent w-full mt-1"
        />
      ) : (
        <p
          className={`text-sm text-gray-500 mt-1 ${!disabled ? 'cursor-pointer hover:text-blue-500' : ''}`}
          onClick={() => !disabled && setEditingDesc(true)}
          title={!disabled ? 'Click to edit' : undefined}
        >
          {round.description || (!disabled ? 'Click to add description...' : '')}
        </p>
      )}
    </div>
  );
}
