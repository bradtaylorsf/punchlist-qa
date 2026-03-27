import { initAdapters } from '../helpers.js';

export async function revokeCommand(email: string): Promise<void> {
  const { storage } = await initAdapters();

  try {
    const user = await storage.getUserByEmail(email);
    if (!user) {
      console.error(`\n  No user found with email: ${email}\n`);
      process.exit(1);
    }
    await storage.revokeUser(email);
    console.log(`\n  Revoked access for ${email}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  Failed to revoke: ${message}\n`);
    process.exit(1);
  } finally {
    await storage.close();
  }
}
