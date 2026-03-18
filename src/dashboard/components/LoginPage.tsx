import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Punchlist QA</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
            Invite Token
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your invite token"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
