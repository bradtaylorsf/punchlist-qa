import { useState, useEffect } from 'react';
import * as api from '../api/client';

interface ConfigData {
  projectName: string;
  testCases: Array<{
    id: string;
    title: string;
    category: string;
    priority: string;
    instructions: string;
    expectedResult: string;
  }>;
  categories: Array<{ id: string; label: string; description?: string }>;
}

export function useConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((res) => setConfig(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { config, loading, error };
}
