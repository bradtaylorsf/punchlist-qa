import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api/client';

export interface Project {
  id: string;
  repoSlug: string;
  name: string;
  githubTokenEncrypted: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Top-level provider: loads the full projects list ──

interface ProjectContextValue {
  projects: Project[];
  loading: boolean;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.data);
    } catch {
      // If fetching fails, continue without project context
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <ProjectContext.Provider value={{ projects, loading, refreshProjects: loadProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

// ── Workspace provider: derives current project from URL :projectId ──

interface WorkspaceContextValue {
  currentProject: Project;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, loading } = useProject();

  const project = projects.find((p) => p.id === projectId) ?? null;

  // Sync module-level activeProjectId for API calls
  useEffect(() => {
    if (project) {
      api.setActiveProject(project.id);
    }
    return () => {
      api.setActiveProject(null);
    };
  }, [project?.id]);

  // Wait for the project list to load before deciding "not found"
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-2">
        <p className="text-gray-500">Project not found.</p>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ currentProject: project }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceProject() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceProject must be used within WorkspaceProjectProvider');
  return ctx;
}
