import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  revoked: boolean;
  createdAt: string;
}

interface AccessRequestRecord {
  id: string;
  email: string;
  name: string;
  status: string;
  message: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('tester');
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Revoke
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Access requests
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>([]);
  const [approving, setApproving] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, requestsRes] = await Promise.all([
        api.listUsers(),
        api.listAccessRequests(),
      ]);
      setUsers(usersRes.data as unknown as UserRecord[]);
      setAccessRequests(requestsRes.data as unknown as AccessRequestRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') loadData();
    else setLoading(false);
  }, [user?.role, loadData]);

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Admin access required to manage users.</p>
      </div>
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteUrl(null);
    setError(null);
    try {
      const res = await api.inviteUser({ email, name, role });
      setInviteUrl(res.data.inviteUrl);
      setEmail('');
      setName('');
      setRole('tester');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(targetEmail: string) {
    setRevoking(true);
    setError(null);
    try {
      await api.revokeUser(targetEmail);
      setRevokeTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke user');
    } finally {
      setRevoking(false);
    }
  }

  async function handleApprove(requestId: string) {
    setApproving(requestId);
    setError(null);
    try {
      const res = await api.approveAccessRequest(requestId);
      setInviteUrl(res.data.inviteUrl);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setApproving(null);
    }
  }

  async function handleReject(requestId: string) {
    setApproving(requestId);
    setError(null);
    try {
      await api.rejectAccessRequest(requestId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setApproving(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Users</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Invite Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Invite User</h2>
        <form onSubmit={handleInvite} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="user@example.com"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="Full Name"
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
            type="submit"
            disabled={inviting}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {inviting ? 'Inviting...' : 'Invite'}
          </button>
        </form>
        {inviteUrl && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <p className="text-xs text-green-700 mb-1">Invite created! Share this URL:</p>
            <code className="text-xs text-green-900 break-all select-all">{inviteUrl}</code>
          </div>
        )}
      </div>

      {/* User Table */}
      {loading ? (
        <p className="text-gray-500">Loading users...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Created</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-gray-900">{u.email}</td>
                  <td className="px-4 py-2 text-gray-700">{u.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${u.revoked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                    >
                      {u.revoked ? 'revoked' : 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!u.revoked && u.email !== user?.email && (
                      <button
                        onClick={() => setRevokeTarget(u.email)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Access Requests */}
      {accessRequests.filter((r) => r.status === 'pending').length > 0 && (
        <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <h2 className="text-sm font-medium text-amber-800">
              Pending Access Requests ({accessRequests.filter((r) => r.status === 'pending').length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {accessRequests
              .filter((r) => r.status === 'pending')
              .map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.email}</p>
                    {r.message && <p className="text-xs text-gray-400 mt-1">{r.message}</p>}
                    <p className="text-xs text-gray-400">
                      Requested {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={approving === r.id}
                      className="text-xs px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded border border-green-200 disabled:opacity-50"
                    >
                      {approving === r.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(r.id)}
                      disabled={approving === r.id}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded border border-red-200 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Revoke Confirmation */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Revoke Access</h3>
            <p className="text-sm text-gray-600 mb-6">
              Revoke access for <strong>{revokeTarget}</strong>? They will no longer be able to log in.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(revokeTarget)}
                disabled={revoking}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {revoking ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
