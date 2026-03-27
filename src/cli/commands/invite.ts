import { validateEmail } from '../../shared/validation.js';
import { initAdapters } from '../helpers.js';
import { generateToken, hashToken, buildInviteUrl } from '../../server/auth/invite.js';
import { userRoleSchema } from '../../shared/schemas.js';

export interface InviteOptions {
  name: string;
  role?: string;
  baseUrl?: string;
}

export async function inviteCommand(email: string, options: InviteOptions): Promise<void> {
  if (!validateEmail(email)) {
    console.error(`\n  Invalid email: ${email}\n`);
    process.exit(1);
  }

  const { config, storage } = await initAdapters();

  try {
    const secret = config.secrets.authSecret;
    if (!secret) {
      console.error('\n  PUNCHLIST_AUTH_SECRET not set.\n');
      process.exit(1);
    }

    const role = userRoleSchema.parse(options.role ?? 'tester');
    const token = generateToken(secret, email);
    const tokenHash = hashToken(token);

    await storage.createUser({
      email,
      name: options.name,
      tokenHash,
      role,
      invitedBy: 'cli@punchlist-qa.local',
    });

    const baseUrl = options.baseUrl ?? 'http://localhost:4747';
    const inviteUrl = buildInviteUrl(baseUrl, token);

    console.log(`\n  Invited ${email}`);
    console.log(`  Invite link: ${inviteUrl}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint')) {
      console.error(`\n  ${email} already exists.\n`);
    } else {
      console.error(`\n  Failed to invite: ${message}\n`);
    }
    process.exit(1);
  } finally {
    await storage.close();
  }
}
