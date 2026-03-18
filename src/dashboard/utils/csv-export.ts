import type { TestCase, Category, Result } from '../../shared/schemas';

type CSVResult = Pick<Result, 'testId' | 'status' | 'testerName' | 'commitHash' | 'severity' | 'description' | 'issueUrl'>;

export function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function buildCSV(
  testCases: TestCase[],
  results: Map<string, CSVResult>,
  categories: Category[],
): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c.label]));

  const header = [
    'Category',
    'Test ID',
    'Title',
    'Status',
    'Tester',
    'Commit',
    'Severity',
    'Description',
    'Issue URL',
  ];

  const rows = testCases.map((tc) => {
    const r = results.get(tc.id);
    return [
      categoryMap.get(tc.category) || tc.category,
      tc.id,
      tc.title,
      r ? r.status : 'remaining',
      r?.testerName || '',
      r?.commitHash || '',
      r?.severity || '',
      r?.description || '',
      r?.issueUrl || '',
    ];
  });

  return [header, ...rows].map((row) => row.map((cell) => escapeCSV(String(cell))).join(',')).join('\n');
}

export function exportRoundCSV(
  roundName: string,
  testCases: TestCase[],
  results: Map<string, CSVResult>,
  categories: Category[],
): void {
  const csv = buildCSV(testCases, results, categories);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `qa-round-${sanitizeFilename(roundName)}-${date}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
