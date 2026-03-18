import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILENAME = '.env';

/**
 * Minimal .env file parser. No external dependencies.
 * Handles KEY=VALUE, KEY="VALUE", KEY='VALUE', and comments (#).
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Parse .env file from the given directory and return the key-value pairs.
 * Does NOT mutate process.env. Callers decide how to use the result.
 */
export function readEnvFile(cwd?: string): Record<string, string> {
  const dir = cwd ?? process.cwd();
  const envPath = join(dir, ENV_FILENAME);
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf-8');
  return parseEnvFile(content);
}

/**
 * Load environment variables from .env file into process.env.
 * Does NOT override existing process.env values.
 * Use readEnvFile() when you need the values without side effects.
 */
export function loadEnv(cwd?: string): void {
  const parsed = readEnvFile(cwd);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export interface ResolvedSecrets {
  githubToken: string;
  authSecret: string;
}

/**
 * Resolve secrets from a merged env source (file values + process.env).
 * File values are used as defaults; process.env takes precedence.
 */
export function resolveSecrets(cwd?: string): ResolvedSecrets {
  const fileEnv = readEnvFile(cwd);

  const get = (key: string, ...fallbacks: string[]): string => {
    // process.env takes precedence over file values
    if (process.env[key]) return process.env[key];
    if (fileEnv[key]) return fileEnv[key];
    for (const fb of fallbacks) {
      if (process.env[fb]) return process.env[fb];
      if (fileEnv[fb]) return fileEnv[fb];
    }
    return '';
  };

  return {
    githubToken: get('PUNCHLIST_GITHUB_TOKEN', 'GITHUB_TOKEN'),
    authSecret: get('PUNCHLIST_AUTH_SECRET'),
  };
}

/**
 * Write or append key=value pairs to a .env file.
 * Skips keys that already exist in the file.
 */
export function writeEnvFile(vars: Record<string, string>, cwd?: string): void {
  const dir = cwd ?? process.cwd();
  const envPath = join(dir, ENV_FILENAME);

  let existing = '';
  if (existsSync(envPath)) {
    existing = readFileSync(envPath, 'utf-8');
  }

  const existingKeys = new Set<string>();
  for (const line of existing.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex !== -1) {
      existingKeys.add(trimmed.slice(0, eqIndex).trim());
    }
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    if (!existingKeys.has(key)) {
      lines.push(`${key}="${value}"`);
    }
  }

  if (lines.length > 0) {
    const separator = existing && !existing.endsWith('\n') ? '\n' : '';
    const header = !existing ? '# Punchlist QA — secrets (do NOT commit this file)\n\n' : '';
    writeFileSync(envPath, existing + separator + header + lines.join('\n') + '\n', 'utf-8');
  }
}
