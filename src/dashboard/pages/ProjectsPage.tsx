import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { ProjectMembersSection } from '../components/ProjectMembersSection';
import * as api from '../api/client';
import type { SyncResultData } from '../api/client';

interface ProjectUser {
  projectId: string;
  userEmail: string;
  role: string;
  createdAt: string;
}

interface ProjectWithMembers {
  id: string;
  repoSlug: string;
  name: string;
  githubTokenEncrypted: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectUser[];
}

interface SyncStatus {
  syncedAt: string | null;
  categoriesCount: number;
  testCasesCount: number;
}

function SyncDiffSummary({ data }: { data: SyncResultData }) {
  const catTotal = data.categories.added.length + data.categories.updated.length + data.categories.removed.length;
  const tcTotal = data.testCases.added.length + data.testCases.updated.length + data.testCases.removed.length;

  if (data.isFirstSync) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          First sync — importing from <code className="text-xs bg-gray-100 px-1 rounded">punchlist.config.json</code>:
        </p>
        <div className="text-sm space-y-1">
          <p className="text-green-700">{data.categories.added.length} categories</p>
          <p className="text-green-700">{data.testCases.added.length} test cases</p>
        </div>
      </div>
    );
  }

  if (catTotal === 0 && tcTotal === 0) {
    return <p className="text-sm text-gray-500">Everything is up to date. No changes found.</p>;
  }

  return (
    <div className="space-y-3">
      {catTotal > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Categories</p>
          <div className="text-sm space-y-0.5">
            {data.categories.added.length > 0 && (
              <p className="text-green-700">+ {data.categories.added.length} new</p>
            )}
            {data.categories.updated.length > 0 && (
              <p className="text-amber-700">~ {data.categories.updated.length} updated</p>
            )}
            {data.categories.removed.length > 0 && (
              <p className="text-red-700">- {data.categories.removed.length} removed</p>
            )}
          </div>
        </div>
      )}
      {tcTotal > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Test Cases</p>
          <div className="text-sm space-y-0.5">
            {data.testCases.added.length > 0 && (
              <p className="text-green-700">+ {data.testCases.added.length} new</p>
            )}
            {data.testCases.updated.length > 0 && (
              <p className="text-amber-700">~ {data.testCases.updated.length} updated</p>
            )}
            {data.testCases.removed.length > 0 && (
              <p className="text-red-700">- {data.testCases.removed.length} removed</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface GitHubTokenEntry {
  id: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

function GitHubTokensSection({ onError }: { onError: (msg: string) => void }) {
  const [tokens, setTokens] = useState<GitHubTokenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState('');
  const [token, setToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      const res = await api.listGitHubTokens();
      setTokens(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedOwner = owner.trim();
    const trimmedToken = token.trim();
    if (!trimmedOwner || !trimmedToken) return;
    setAdding(true);
    try {
      await api.createGitHubToken({ owner: trimmedOwner, token: trimmedToken });
      setOwner('');
      setToken('');
      await loadTokens();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save token');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(ownerName: string) {
    setRemovingKey(ownerName);
    try {
      await api.deleteGitHubToken(ownerName);
      await loadTokens();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove token');
    } finally {
      setRemovingKey(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-700">GitHub Tokens</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Register a GitHub token per organization or user account. Used for config sync and issue creation.
        </p>
      </div>

      {/* Existing tokens */}
      {!loading && tokens.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Owner</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Added</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tokens.map((t) => (
              <tr key={t.owner}>
                <td className="px-4 py-2 text-gray-900 font-mono text-xs">{t.owner}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleRemove(t.owner)}
                    disabled={removingKey === t.owner}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {removingKey === t.owner ? 'Removing...' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && tokens.length === 0 && (
        <div className="px-4 py-3 text-xs text-gray-500">
          No tokens registered. Falling back to the global PUNCHLIST_GITHUB_TOKEN environment variable.
        </div>
      )}

      {/* Add token form */}
      <form onSubmit={handleAdd} className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">GitHub owner (org or username)</label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            placeholder="e.g. the-answerai"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">GitHub token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            placeholder="ghp_... or github_pat_..."
          />
        </div>
        <button
          type="submit"
          disabled={adding || !owner.trim() || !token.trim()}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? 'Saving...' : 'Add'}
        </button>
      </form>
    </div>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { refreshProjects } = useProject();

  const [projectsWithMembers, setProjectsWithMembers] = useState<ProjectWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add project form
  const [newRepo, setNewRepo] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync state
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [syncTarget, setSyncTarget] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<SyncResultData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadSyncStatus = useCallback(async (projectId: string) => {
    try {
      const sRes = await api.getSyncStatus(projectId);
      setSyncStatuses((prev) => ({ ...prev, [projectId]: sRes.data }));
    } catch { /* ignore — sync may not be available */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await refreshProjects();
      const res = await api.listProjects();
      const withMembers = await Promise.all(
        res.data.map(async (p) => {
          let members: ProjectUser[] = [];
          try {
            const mRes = await api.listProjectUsers(p.id);
            members = mRes.data;
          } catch { /* ignore */ }
          return { ...p, members };
        }),
      );
      setProjectsWithMembers(withMembers);

      // Load sync statuses in background (non-blocking)
      for (const p of res.data) {
        loadSyncStatus(p.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [refreshProjects, loadSyncStatus]);

  useEffect(() => {
    if (user?.role === 'admin') loadAll();
    else setLoading(false);
  }, [user?.role, loadAll]);

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Admin access required to manage projects.</p>
      </div>
    );
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await api.createProject({ repoSlug: newRepo.trim() });
      setNewRepo('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteProject(id: string) {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(id);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  }

  function handleMembersChanged(projectId: string, members: ProjectUser[]) {
    setProjectsWithMembers((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, members } : p)),
    );
  }

  async function handleSyncPreview(projectId: string) {
    setSyncTarget(projectId);
    setSyncPreview(null);
    setSyncing(true);
    setError(null);
    try {
      const res = await api.syncProjectConfig(projectId, true);
      setSyncPreview(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch config from repo');
      setSyncTarget(null);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncApply() {
    if (!syncTarget) return;
    setApplying(true);
    setError(null);
    try {
      await api.syncProjectConfig(syncTarget, false);
      setSyncTarget(null);
      setSyncPreview(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync config');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Project Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add Project</h2>
        <form onSubmit={handleAddProject} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">GitHub Repository</label>
            <input
              type="text"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="owner/repo or https://github.com/owner/repo"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newRepo.trim()}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add Project'}
          </button>
        </form>
      </div>

      {/* GitHub Tokens */}
      <GitHubTokensSection onError={setError} />

      {/* Projects List */}
      {loading ? (
        <p className="text-gray-500">Loading projects...</p>
      ) : projectsWithMembers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center">
          <p className="text-gray-500 text-sm">No projects yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projectsWithMembers.map((project) => {
            const status = syncStatuses[project.id];
            return (
              <div key={project.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Project header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{project.name}</p>
                    <p className="text-xs text-gray-500">{project.repoSlug}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {project.members.length} member{project.members.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => handleSyncPreview(project.id)}
                      disabled={syncing && syncTarget === project.id}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {syncing && syncTarget === project.id ? 'Loading...' : 'Sync Config'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(project.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Sync status bar */}
                {status && (
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {status.testCasesCount} test cases, {status.categoriesCount} categories
                    </span>
                    <span className="text-xs text-gray-400">
                      {status.syncedAt
                        ? `Synced ${new Date(status.syncedAt).toLocaleDateString()}`
                        : 'Never synced'}
                    </span>
                  </div>
                )}

                {/* Members section */}
                <ProjectMembersSection
                  projectId={project.id}
                  members={project.members}
                  onMembersChanged={(members) => handleMembersChanged(project.id, members)}
                  onError={setError}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Sync Preview Modal */}
      {syncTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-1">Sync Config</h3>
            <p className="text-xs text-gray-500 mb-4">
              {projectsWithMembers.find((p) => p.id === syncTarget)?.repoSlug}
            </p>

            {syncing ? (
              <p className="text-sm text-gray-500 py-4">Fetching config from repository...</p>
            ) : syncPreview ? (
              <div className="mb-6">
                <SyncDiffSummary data={syncPreview} />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSyncTarget(null); setSyncPreview(null); }}
                disabled={applying}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              {syncPreview && (
                <button
                  onClick={handleSyncApply}
                  disabled={applying}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying ? 'Applying...' : 'Apply Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-600 mb-6">
              Delete{' '}
              <strong>
                {projectsWithMembers.find((p) => p.id === deleteTarget)?.name ?? deleteTarget}
              </strong>
              ? This action cannot be undone. All rounds and results for this project will be
              removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(deleteTarget)}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
