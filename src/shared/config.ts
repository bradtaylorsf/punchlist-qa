import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { punchlistConfigSchema } from './schemas.js';
import { resolveSecrets } from './env.js';
import { CONFIG_FILENAME } from './constants.js';
import type { PunchlistConfig } from './schemas.js';

export interface ResolvedConfig extends PunchlistConfig {
  secrets: {
    githubToken: string;
    authSecret: string;
  };
}

/**
 * Load config from punchlist.config.json and resolve secrets from .env / env vars.
 */
export function loadConfig(cwd?: string): ResolvedConfig {
  const dir = cwd ?? process.cwd();

  // Parse and validate the JSON config
  const configPath = join(dir, CONFIG_FILENAME);
  const raw = readFileSync(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'unknown error';
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${message}`);
  }
  const config = punchlistConfigSchema.parse(parsed);

  // Resolve secrets from .env file + environment (no process.env mutation)
  const secrets = resolveSecrets(dir);

  return { ...config, secrets };
}

/**
 * Write config JSON (secrets are never written here — they go in .env).
 */
export function writeConfig(config: PunchlistConfig, cwd?: string): void {
  const dir = cwd ?? process.cwd();
  const configPath = join(dir, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
