import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from '../api/client';

interface Project {
  id: string;
  repoSlug: string;
  name: string;
  githubTokenEncrypted: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectContextValue {
  currentProject: Project | null;
  projects: Project[];
  loading: boolean;
  setCurrentProject: (project: Project) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const PROJECT_KEY = 'punchlist-active-project-id';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.listProjects();
      const data = res.data;
      setProjects(data);

      // Restore from localStorage or pick first
      const savedId = localStorage.getItem(PROJECT_KEY);
      const saved = savedId ? data.find((p) => p.id === savedId) : null;
      const selected = saved || data[0] || null;

      if (selected) {
        setCurrentProjectState(selected);
        api.setActiveProject(selected.id);
        localStorage.setItem(PROJECT_KEY, selected.id);
      }
    } catch {
      // If fetching fails, continue without project context
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const setCurrentProject = useCallback((project: Project) => {
    setCurrentProjectState(project);
    api.setActiveProject(project.id);
    localStorage.setItem(PROJECT_KEY, project.id);
  }, []);

  return (
    <ProjectContext.Provider
      value={{ currentProject, projects, loading, setCurrentProject, refreshProjects: loadProjects }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
