import type { ReactNode } from 'react';
import { NavLink, useLocation, Link, matchPath } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWidget } from '../hooks/useWidget';
import { useProject } from '../hooks/useProject';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { projects } = useProject();
  const location = useLocation();
  useWidget(user);

  // Derive project context from URL path
  const match = matchPath('/projects/:projectId/*', location.pathname);
  const projectId = match?.params.projectId;
  const currentProject = projectId ? projects.find((p) => p.id === projectId) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-semibold text-gray-900 hover:text-gray-700">
              Punchlist QA
            </Link>
            {currentProject && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-sm text-gray-600">{currentProject.name}</span>
              </>
            )}
            {!currentProject && user?.role === 'admin' && (
              <div className="flex gap-4 ml-4">
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
                  }
                >
                  Users
                </NavLink>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
