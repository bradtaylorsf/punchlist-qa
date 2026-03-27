import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api/client';

export function LoginPage() {
  const { loginWithPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Access request state
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [reqEmail, setReqEmail] = useState('');
  const [reqName, setReqName] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithPassword(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    setRequestError('');
    setRequesting(true);
    try {
      await api.requestAccess({ email: reqEmail, name: reqName, message: reqMessage || undefined });
      setRequestSuccess(true);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Punchlist QA</h1>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => setMode('request')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Need access? Request an invite
            </button>
          ) : requestSuccess ? (
            <div className="text-center">
              <p className="text-sm text-green-700 font-medium">Request submitted!</p>
              <p className="text-xs text-gray-500 mt-1">
                An admin will review your request. You will receive an invite link once approved.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setRequestSuccess(false);
                }}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                Back to login
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 mb-3">Request Access</p>
              <form onSubmit={handleRequestAccess} className="space-y-3">
                <input
                  type="email"
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={requesting}
                />
                <input
                  type="text"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={requesting}
                />
                <textarea
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  placeholder="Why do you need access? (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                  disabled={requesting}
                />
                {requestError && <p className="text-sm text-red-600">{requestError}</p>}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to login
                  </button>
                  <button
                    type="submit"
                    disabled={requesting}
                    className="bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {requesting ? 'Submitting...' : 'Request Access'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
