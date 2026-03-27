import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceProject, useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import { ProjectMembersSection } from '../components/ProjectMembersSection';
import * as api from '../api/client';
import type { SyncResultData } from '../api/client';

interface ProjectUser {
  projectId: string;
  userEmail: string;
  role: string;
  createdAt: string;
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

export function ProjectSettingsPage() {
  const { user } = useAuth();
  const { currentProject } = useWorkspaceProject();
  const { refreshProjects } = useProject();

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Admin access required to manage project settings.</p>
      </div>
    );
  }
  const navigate = useNavigate();

  const [members, setMembers] = useState<ProjectUser[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync modal state
  const [syncPreview, setSyncPreview] = useState<SyncResultData | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, syncRes] = await Promise.allSettled([
        api.listProjectUsers(currentProject.id),
        api.getSyncStatus(currentProject.id),
      ]);
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data);
      if (syncRes.status === 'fulfilled') setSyncStatus(syncRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [currentProject.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSyncPreview() {
    setShowSyncModal(true);
    setSyncPreview(null);
    setSyncing(true);
    setError(null);
    try {
      const res = await api.syncProjectConfig(currentProject.id, true);
      setSyncPreview(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch config from repo');
      setShowSyncModal(false);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncApply() {
    setApplying(true);
    setError(null);
    try {
      await api.syncProjectConfig(currentProject.id, false);
      setShowSyncModal(false);
      setSyncPreview(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync config');
    } finally {
      setApplying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(currentProject.id);
      await refreshProjects();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Config Sync */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Config Sync</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sync test cases and categories from <code className="bg-gray-100 px-1 rounded">punchlist.config.json</code> in your repo.
          </p>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {syncStatus ? (
              <>
                {syncStatus.testCasesCount} test cases, {syncStatus.categoriesCount} categories
                <span className="mx-2 text-gray-300">|</span>
                {syncStatus.syncedAt
                  ? `Last synced ${new Date(syncStatus.syncedAt).toLocaleDateString()}`
                  : 'Never synced'}
              </>
            ) : (
              'No sync status available'
            )}
          </div>
          <button
            onClick={handleSyncPreview}
            disabled={syncing}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {syncing ? 'Loading...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Members</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''} in this project.
          </p>
        </div>
        <ProjectMembersSection
          projectId={currentProject.id}
          members={members}
          onMembersChanged={setMembers}
          onError={setError}
        />
      </div>

      {/* Danger Zone */}
      <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-red-100">
          <h2 className="text-sm font-medium text-red-900">Danger Zone</h2>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-900">Delete this project</p>
            <p className="text-xs text-gray-500">All rounds and results will be permanently removed.</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm px-3 py-1.5 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
          >
            Delete Project
          </button>
        </div>
      </div>

      {/* Sync Preview Modal */}
      {showSyncModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onKeyDown={(e) => { if (e.key === 'Escape' && !applying) { setShowSyncModal(false); setSyncPreview(null); } }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-1">Sync Config</h3>
            <p className="text-xs text-gray-500 mb-4">{currentProject.repoSlug}</p>

            {syncing ? (
              <p className="text-sm text-gray-500 py-4">Fetching config from repository...</p>
            ) : syncPreview ? (
              <div className="mb-6">
                <SyncDiffSummary data={syncPreview} />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSyncModal(false); setSyncPreview(null); }}
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
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onKeyDown={(e) => { if (e.key === 'Escape' && !deleting) setShowDeleteConfirm(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-600 mb-6">
              Delete <strong>{currentProject.name}</strong>? This action cannot be undone. All rounds
              and results for this project will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
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
