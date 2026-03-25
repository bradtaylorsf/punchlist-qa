import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import * as api from '../api/client';

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
  membersLoading: boolean;
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { projects, refreshProjects } = useProject();

  const [projectsWithMembers, setProjectsWithMembers] = useState<ProjectWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add project form
  const [newName, setNewName] = useState('');
  const [newRepoSlug, setNewRepoSlug] = useState('');
  const [newGithubToken, setNewGithubToken] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add member state: keyed by projectId
  const [addMemberEmail, setAddMemberEmail] = useState<Record<string, string>>({});
  const [addMemberRole, setAddMemberRole] = useState<Record<string, string>>({});
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const loadMembers = useCallback(async (projectId: string): Promise<ProjectUser[]> => {
    try {
      const res = await api.listProjectUsers(projectId);
      return res.data;
    } catch {
      return [];
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await refreshProjects();
      // projects state updates asynchronously; use the API directly here
      const res = await api.listProjects();
      const data = res.data;

      const withMembers = await Promise.all(
        data.map(async (p) => {
          const members = await loadMembers(p.id);
          return { ...p, members, membersLoading: false };
        }),
      );
      setProjectsWithMembers(withMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [refreshProjects, loadMembers]);

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
      await api.createProject({
        name: newName,
        repoSlug: newRepoSlug,
        ...(newGithubToken ? { githubToken: newGithubToken } : {}),
      });
      setNewName('');
      setNewRepoSlug('');
      setNewGithubToken('');
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

  async function handleAddMember(projectId: string) {
    const email = addMemberEmail[projectId]?.trim();
    if (!email) return;
    const role = addMemberRole[projectId] || 'tester';
    setAddingMember(projectId);
    setError(null);
    try {
      await api.addProjectUser(projectId, email, role);
      setAddMemberEmail((prev) => ({ ...prev, [projectId]: '' }));
      const members = await loadMembers(projectId);
      setProjectsWithMembers((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, members } : p)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(null);
    }
  }

  async function handleRemoveMember(projectId: string, email: string) {
    setRemovingMember(`${projectId}:${email}`);
    setError(null);
    try {
      await api.removeProjectUser(projectId, email);
      const members = await loadMembers(projectId);
      setProjectsWithMembers((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, members } : p)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingMember(null);
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
        <form onSubmit={handleAddProject} className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="My Project"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">Repo Slug</label>
            <input
              type="text"
              value={newRepoSlug}
              onChange={(e) => setNewRepoSlug(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="owner/repo"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">GitHub Token (optional)</label>
            <input
              type="password"
              value={newGithubToken}
              onChange={(e) => setNewGithubToken(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              placeholder="ghp_..."
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add Project'}
          </button>
        </form>
      </div>

      {/* Projects List */}
      {loading ? (
        <p className="text-gray-500">Loading projects...</p>
      ) : projectsWithMembers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center">
          <p className="text-gray-500 text-sm">No projects yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projectsWithMembers.map((project) => (
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
                    onClick={() => setDeleteTarget(project.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Members table */}
              {project.members.length > 0 && (
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
                    {project.members.map((m) => (
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
                            onClick={() => handleRemoveMember(project.id, m.userEmail)}
                            disabled={removingMember === `${project.id}:${m.userEmail}`}
                            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {removingMember === `${project.id}:${m.userEmail}`
                              ? 'Removing...'
                              : 'Remove'}
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
                    value={addMemberEmail[project.id] || ''}
                    onChange={(e) =>
                      setAddMemberEmail((prev) => ({ ...prev, [project.id]: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Role</label>
                  <select
                    value={addMemberRole[project.id] || 'tester'}
                    onChange={(e) =>
                      setAddMemberRole((prev) => ({ ...prev, [project.id]: e.target.value }))
                    }
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  >
                    <option value="tester">Tester</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  onClick={() => handleAddMember(project.id)}
                  disabled={addingMember === project.id || !addMemberEmail[project.id]?.trim()}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingMember === project.id ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          ))}
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
