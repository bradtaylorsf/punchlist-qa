import { useProject } from '../hooks/useProject';

export function ProjectSwitcher() {
  const { currentProject, projects, setCurrentProject } = useProject();

  // Don't show switcher if there's only one project
  if (projects.length <= 1) return null;

  return (
    <select
      value={currentProject?.id || ''}
      onChange={(e) => {
        const project = projects.find((p) => p.id === e.target.value);
        if (project) setCurrentProject(project);
      }}
      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Switch project"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.repoSlug})
        </option>
      ))}
    </select>
  );
}
