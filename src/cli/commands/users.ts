import { initAdapters } from '../helpers.js';

export async function usersCommand(): Promise<void> {
  const { auth, storage } = await initAdapters();

  try {
    const users = await auth.listUsers();

    if (users.length === 0) {
      console.log('\n  No users yet. Run "punchlist-qa invite <email> --name <name>" to add one.\n');
      return;
    }

    console.log('');
    const emailWidth = Math.max(6, ...users.map(u => u.email.length));
    const nameWidth = Math.max(5, ...users.map(u => u.name.length));
    const roleWidth = Math.max(5, ...users.map(u => u.role.length));
    const header = `  ${'Email'.padEnd(emailWidth)}  ${'Name'.padEnd(nameWidth)}  ${'Role'.padEnd(roleWidth)}  ${'Status'.padEnd(8)}  Created`;
    console.log(header);
    console.log('  ' + '-'.repeat(header.length - 2));

    for (const user of users) {
      const status = user.revoked ? 'revoked' : 'active';
      const created = new Date(user.createdAt).toLocaleDateString();
      console.log(`  ${user.email.padEnd(emailWidth)}  ${user.name.padEnd(nameWidth)}  ${user.role.padEnd(roleWidth)}  ${status.padEnd(8)}  ${created}`);
    }
    console.log('');
  } finally {
    await storage.close();
  }
}
