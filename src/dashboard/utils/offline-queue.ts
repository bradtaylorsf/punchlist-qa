import { z } from 'zod';

const pendingResultSchema = z.object({
  roundId: z.string(),
  testId: z.string(),
  status: z.string(),
  description: z.string().optional(),
  severity: z.string().optional(),
  commitHash: z.string().optional(),
  queuedAt: z.string(),
  retryCount: z.number(),
});

export type PendingResult = z.infer<typeof pendingResultSchema>;

const pendingResultsArraySchema = z.array(pendingResultSchema);

const STORAGE_KEY = 'punchlist_pending_results';
const MAX_RETRIES = 50;

export function getPendingResults(): PendingResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const result = pendingResultsArraySchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function save(items: PendingResult[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addPendingResult(result: PendingResult): void {
  const items = getPendingResults();
  // Dedup by roundId + testId (replace existing)
  const filtered = items.filter(
    (p) => !(p.roundId === result.roundId && p.testId === result.testId),
  );
  filtered.push(result);
  save(filtered);
}

export function removePendingResult(roundId: string, testId: string): void {
  const items = getPendingResults();
  save(items.filter((p) => !(p.roundId === roundId && p.testId === testId)));
}

export function updateRetryCount(roundId: string, testId: string): void {
  const items = getPendingResults();
  const idx = items.findIndex((p) => p.roundId === roundId && p.testId === testId);
  if (idx === -1) return;
  items[idx].retryCount++;
  // Drop items that have exceeded max retries
  if (items[idx].retryCount >= MAX_RETRIES) {
    items.splice(idx, 1);
  }
  save(items);
}

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export { MAX_RETRIES };
