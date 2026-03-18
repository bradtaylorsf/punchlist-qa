import { validateEmail } from '../../shared/validation.js';
import { initAdapters } from '../helpers.js';

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

  const { auth, storage } = await initAdapters();

  try {
    const result = await auth.createInvite(email, options.name, 'cli@punchlist-qa.local', {
      role: options.role,
      baseUrl: options.baseUrl,
    });

    console.log(`\n  Invited ${email}`);
    console.log(`  Invite link: ${result.inviteUrl}\n`);
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
