import { punchlistConfigSchema } from './schemas.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  const result = punchlistConfigSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '';
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { valid: false, errors };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateRepoFormat(repo: string): boolean {
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo);
}
