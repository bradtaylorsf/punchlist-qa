import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, writeConfig } from '../../shared/config.js';
import { validateEmail } from '../../shared/validation.js';
import { DEFAULT_PORT, CONFIG_FILENAME } from '../../shared/constants.js';
import { TokenAuthAdapter } from '../../adapters/auth/token.js';

export async function inviteCommand(email: string): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found. Run "punchlist-qa init" first.\n`);
    process.exit(1);
  }

  if (!validateEmail(email)) {
    console.error(`\n  Invalid email: ${email}\n`);
    process.exit(1);
  }

  const resolved = loadConfig(cwd);

  if (!resolved.secrets.authSecret) {
    console.error('\n  PUNCHLIST_AUTH_SECRET not set. Add it to .env or environment.\n');
    process.exit(1);
  }

  // Check if tester already exists and is active
  const existing = resolved.testers.find(t => t.email === email && !t.revokedAt);
  if (existing) {
    console.log(`\n  ⚠ ${email} is already an active tester.`);
    console.log(`  Invite link: http://localhost:${DEFAULT_PORT}/join?token=${existing.token}\n`);
    return;
  }

  const auth = new TokenAuthAdapter(resolved.secrets.authSecret);
  const token = auth.generateToken(email);

  resolved.testers.push({
    email,
    token,
    createdAt: new Date().toISOString(),
  });

  // Write back without the secrets field
  const { secrets: _, ...config } = resolved;
  writeConfig(config, cwd);

  console.log(`\n  ✅ Invited ${email}`);
  console.log(`  Invite link: http://localhost:${DEFAULT_PORT}/join?token=${token}\n`);
}
