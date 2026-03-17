import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const commands = ['init', 'serve', 'invite', 'revoke', 'users'] as const;
type Command = typeof commands[number];

function printHelp(): void {
  console.log(`
punchlist-qa — QA testing dashboard and support widget toolkit

Usage:
  punchlist-qa <command> [options]

Commands:
  init              Initialize Punchlist QA in a project
  serve             Start the QA dashboard server
  invite <email>    Generate a tester invite link
  revoke <email>    Revoke a tester's access
  users             List active testers

Options:
  --help, -h        Show this help message
  --version, -v     Show version number

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

  switch (command) {
    case 'init': {
      const { initCommand } = await import('./commands/init.js');
      await initCommand();
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
        console.error('Usage: punchlist-qa invite <email>');
        process.exit(1);
      }
      const { inviteCommand } = await import('./commands/invite.js');
      await inviteCommand(email);
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
  }
}
