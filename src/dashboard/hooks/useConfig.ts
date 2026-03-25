import { useState, useEffect } from 'react';
import * as api from '../api/client';
import { useProject } from './useProject';

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
  const { currentProject } = useProject();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setConfig(null);
    setError(null);

    api
      .getConfig()
      .then((res) => setConfig(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [currentProject?.id]);

  return { config, loading, error };
}
