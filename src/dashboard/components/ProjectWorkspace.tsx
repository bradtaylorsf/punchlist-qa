import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { WorkspaceProjectProvider, useWorkspaceProject } from '../hooks/useProject';

function WorkspaceContent() {
  const { currentProject } = useWorkspaceProject();
  const { user } = useAuth();

  const basePath = `/projects/${currentProject.id}`;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm px-3 py-1.5 rounded-md ${
      isActive
        ? 'bg-blue-50 text-blue-700 font-medium'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <div>
      {/* Sub-navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 pb-3">
        <NavLink to={`${basePath}/testing`} className={linkClass}>
          Testing
        </NavLink>
        <NavLink to={`${basePath}/history`} className={linkClass}>
          History
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to={`${basePath}/settings`} className={linkClass}>
            Settings
          </NavLink>
        )}
      </div>

      <Outlet />
    </div>
  );
}

export function ProjectWorkspace() {
  return (
    <WorkspaceProjectProvider>
      <WorkspaceContent />
    </WorkspaceProjectProvider>
  );
}
