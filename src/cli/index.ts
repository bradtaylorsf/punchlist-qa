import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const commands = ['init', 'serve', 'invite', 'revoke', 'users', 'update-skills'] as const;
type Command = (typeof commands)[number];

function printHelp(): void {
  console.log(`
punchlist-qa — QA testing dashboard and support widget toolkit

Usage:
  punchlist-qa <command> [options]

Commands:
  init [--hosted|--local]       Initialize Punchlist QA in a project
  serve                         Start the QA dashboard server
  invite <email> --name <name>  Generate a tester invite link
  revoke <email>                Revoke a tester's access
  users                         List all users
  update-skills                 Update AI skills to latest version

Options:
  --help, -h        Show this help message
  --version, -v     Show version number

Invite options:
  --name <name>     Tester's display name (required)
  --role <role>     User role: tester or admin (default: tester)
  --base-url <url>  Base URL for invite link

Interactive mode:
  punchlist-qa              Run with no args to enter interactive mode
  pnpm cli                  Same thing via pnpm
`);
}

function printVersion(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
  console.log(`punchlist-qa v${pkg.version}`);
}

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      name: { type: 'string' },
      role: { type: 'string' },
      'base-url': { type: 'string' },
      hosted: { type: 'boolean', default: false },
      local: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) {
    printVersion();
    return;
  }

  const rawCommand = positionals[0];

  if (values.help || !rawCommand || rawCommand === 'help') {
    printHelp();
    return;
  }

  if (rawCommand === 'version') {
    printVersion();
    return;
  }

  const command = rawCommand as Command;

  if (!commands.includes(command)) {
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  if (command !== 'invite' && (values.name || values.role || values['base-url'])) {
    console.error(
      `Flags --name, --role, and --base-url are only valid with the "invite" command.\n`,
    );
    process.exit(1);
  }

  switch (command) {
    case 'init': {
      const { initCommand } = await import('./commands/init.js');
      await initCommand({
        hosted: values.hosted as boolean,
        local: values.local as boolean,
      });
      break;
    }
    case 'serve': {
      const { serveCommand } = await import('./commands/serve.js');
      await serveCommand();
      break;
    }
    case 'invite': {
      const email = positionals[1];
      if (!email) {
        console.error('Usage: punchlist-qa invite <email> --name <name>');
        process.exit(1);
      }
      const name = values.name as string | undefined;
      if (!name) {
        console.error('Usage: punchlist-qa invite <email> --name <name>\n  --name is required');
        process.exit(1);
      }
      const { inviteCommand } = await import('./commands/invite.js');
      await inviteCommand(email, {
        name,
        role: values.role as string | undefined,
        baseUrl: values['base-url'] as string | undefined,
      });
      break;
    }
    case 'revoke': {
      const email = positionals[1];
      if (!email) {
        console.error('Usage: punchlist-qa revoke <email>');
        process.exit(1);
      }
      const { revokeCommand } = await import('./commands/revoke.js');
      await revokeCommand(email);
      break;
    }
    case 'users': {
      const { usersCommand } = await import('./commands/users.js');
      await usersCommand();
      break;
    }
    case 'update-skills': {
      const { updateSkillsCommand } = await import('./commands/update-skills.js');
      await updateSkillsCommand();
      break;
    }
  }
}
