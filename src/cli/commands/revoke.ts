import { initAdapters } from '../helpers.js';

export async function revokeCommand(email: string): Promise<void> {
  const { auth, storage } = await initAdapters();

  try {
    await auth.revokeAccess(email);
    console.log(`\n  Revoked access for ${email}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('User not found')) {
      console.error(`\n  No user found with email: ${email}\n`);
    } else {
      console.error(`\n  Failed to revoke: ${message}\n`);
    }
    process.exit(1);
  } finally {
    await storage.close();
  }
}
