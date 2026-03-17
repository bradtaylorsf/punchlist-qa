export const DEFAULT_PORT = 4747;

export const CONFIG_FILENAME = 'punchlist.config.json';

export interface LabelDef {
  name: string;
  color: string;
  description: string;
}

export const DEFAULT_LABELS: LabelDef[] = [
  { name: 'punchlist', color: '6f42c1', description: 'Punchlist QA tracked issue' },
  { name: 'qa:fail', color: 'e11d48', description: 'QA test failure' },
  { name: 'qa:blocked', color: 'f59e0b', description: 'QA test blocked' },
  { name: 'support', color: '3b82f6', description: 'Support ticket from widget' },
  { name: 'blocker', color: 'dc2626', description: 'Blocks release' },
  { name: 'broken', color: 'b91c1c', description: 'Feature is broken' },
  { name: 'minor', color: '6b7280', description: 'Minor issue' },
];

export const DEFAULT_CONFIG = {
  storage: { type: 'sqlite' as const, path: './punchlist.db' },
  widget: {
    position: 'bottom-right' as const,
    theme: 'light' as const,
    corsDomains: ['http://localhost:3000'],
  },
  aiTool: 'claude-code' as const,
} as const;
