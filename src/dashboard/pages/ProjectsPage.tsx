import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { ProjectMembersSection } from '../components/ProjectMembersSection';
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
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { refreshProjects } = useProject();

  const [projectsWithMembers, setProjectsWithMembers] = useState<ProjectWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add project form — just the repo URL or slug
  const [newRepo, setNewRepo] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [refreshProjects]);

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
      // Server handles URL parsing and name derivation
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

              {/* Members section (extracted component) */}
              <ProjectMembersSection
                projectId={project.id}
                members={project.members}
                onMembersChanged={(members) => handleMembersChanged(project.id, members)}
                onError={setError}
              />
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
