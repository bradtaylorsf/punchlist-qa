import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject, type Project } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/projects/${project.id}/testing`)}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{project.repoSlug}</p>
        </div>
        <span className="text-gray-400 text-sm">&rarr;</span>
      </div>
    </button>
  );
}

export function ProjectListPage() {
  const { projects, loading, refreshProjects } = useProject();
  const { user } = useAuth();

  const [newRepo, setNewRepo] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await api.createProject({ repoSlug: newRepo.trim() });
      setNewRepo('');
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading projects...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Add Project — admin only */}
      {user?.role === 'admin' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <form onSubmit={handleAddProject} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Add a GitHub repository</label>
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
      )}

      {/* Project cards */}
      {projects.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center">
          <p className="text-gray-500 text-sm">No projects yet.</p>
          {user?.role === 'admin' && (
            <p className="text-gray-400 text-xs mt-1">Add a GitHub repository above to get started.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
