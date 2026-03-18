import { describe, it, expect } from 'vitest';
import { escapeCSV, buildCSV } from '../../src/dashboard/utils/csv-export';

describe('escapeCSV', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCSV('hello')).toBe('hello');
  });

  it('wraps values with commas in quotes', () => {
    expect(escapeCSV('a,b')).toBe('"a,b"');
  });

  it('wraps values with newlines in quotes', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
  });

  it('handles values with both commas and quotes', () => {
    expect(escapeCSV('"a",b')).toBe('"""a"",b"');
  });

  it('returns empty string unchanged', () => {
    expect(escapeCSV('')).toBe('');
  });
});

describe('buildCSV', () => {
  const categories = [
    { id: 'auth', label: 'Authentication' },
    { id: 'ui', label: 'User Interface' },
  ];

  const testCases = [
    {
      id: 'auth-001',
      title: 'Login flow',
      category: 'auth',
      priority: 'high',
      instructions: 'Test login',
      expectedResult: 'User logged in',
    },
    {
      id: 'ui-001',
      title: 'Dashboard renders',
      category: 'ui',
      priority: 'medium',
      instructions: 'Open dashboard',
      expectedResult: 'Dashboard visible',
    },
  ];

  it('generates correct header row', () => {
    const csv = buildCSV(testCases, new Map(), categories);
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'Category,Test ID,Title,Status,Tester,Commit,Severity,Description,Issue URL',
    );
  });

  it('shows "remaining" for untested cases', () => {
    const csv = buildCSV(testCases, new Map(), categories);
    const rows = csv.split('\n');
    expect(rows[1]).toContain('remaining');
    expect(rows[2]).toContain('remaining');
  });

  it('shows result data for tested cases', () => {
    const results = new Map([
      [
        'auth-001',
        {
          testId: 'auth-001',
          status: 'pass',
          testerName: 'Alice',
          commitHash: 'abc123',
          severity: null,
          description: null,
          issueUrl: null,
        },
      ],
    ]);

    const csv = buildCSV(testCases, results, categories);
    const rows = csv.split('\n');
    expect(rows[1]).toContain('Authentication');
    expect(rows[1]).toContain('auth-001');
    expect(rows[1]).toContain('pass');
    expect(rows[1]).toContain('Alice');
    expect(rows[1]).toContain('abc123');
  });

  it('uses category label instead of id', () => {
    const csv = buildCSV(testCases, new Map(), categories);
    const rows = csv.split('\n');
    expect(rows[1]).toContain('Authentication');
    expect(rows[2]).toContain('User Interface');
  });

  it('escapes values that contain commas', () => {
    const results = new Map([
      [
        'auth-001',
        {
          testId: 'auth-001',
          status: 'fail',
          testerName: 'Alice',
          commitHash: null,
          severity: 'broken',
          description: 'Failed, crashed',
          issueUrl: null,
        },
      ],
    ]);

    const csv = buildCSV(testCases, results, categories);
    expect(csv).toContain('"Failed, crashed"');
  });
});
