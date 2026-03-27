import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ProjectProvider } from './hooks/useProject';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { SetupPage } from './components/SetupPage';
import { SetPasswordPage } from './components/SetPasswordPage';
import { TestingPage } from './pages/TestingPage';
import { HistoryPage } from './pages/HistoryPage';
import { UsersPage } from './pages/UsersPage';
import { ProjectsPage } from './pages/ProjectsPage';

function ProtectedRoutes() {
  const { user, loading, setupRequired } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (setupRequired) {
    return <SetupPage />;
  }

  // Check for ?token= in URL — show set-password flow for invited users
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token && !user) {
    return <SetPasswordPage token={token} />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <ProjectProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<TestingPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ProjectProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
