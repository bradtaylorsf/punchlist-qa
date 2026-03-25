import { useState } from 'react';
import * as api from '../api/client';

interface ProjectUser {
  projectId: string;
  userEmail: string;
  role: string;
  createdAt: string;
}

interface ProjectMembersSectionProps {
  projectId: string;
  members: ProjectUser[];
  onMembersChanged: (members: ProjectUser[]) => void;
  onError: (message: string) => void;
}

export function ProjectMembersSection({
  projectId,
  members,
  onMembersChanged,
  onError,
}: ProjectMembersSectionProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('tester');
  const [adding, setAdding] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  async function loadMembers(): Promise<ProjectUser[]> {
    try {
      const res = await api.listProjectUsers(projectId);
      return res.data;
    } catch {
      return [];
    }
  }

  async function handleAdd() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await api.addProjectUser(projectId, trimmed, role);
      setEmail('');
      const updated = await loadMembers();
      onMembersChanged(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(memberEmail: string) {
    setRemovingKey(memberEmail);
    try {
      await api.removeProjectUser(projectId, memberEmail);
      const updated = await loadMembers();
      onMembersChanged(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingKey(null);
    }
  }

  return (
    <>
      {/* Members table */}
      {members.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Added</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => (
              <tr key={m.userEmail}>
                <td className="px-4 py-2 text-gray-900">{m.userEmail}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${m.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleRemove(m.userEmail)}
                    disabled={removingKey === m.userEmail}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {removingKey === m.userEmail ? 'Removing...' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add member form */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Add member by email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          >
            <option value="tester">Tester</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !email.trim()}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>
    </>
  );
}
