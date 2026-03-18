import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-gray-900">Punchlist QA</span>
            <div className="flex gap-4">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
                }
              >
                Testing
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
                }
              >
                History
              </NavLink>
            </div>
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
