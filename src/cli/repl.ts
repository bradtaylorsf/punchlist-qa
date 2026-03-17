import { createInterface } from 'node:readline';
import { main } from './index.js';

class ExitIntercepted extends Error {
  code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

export async function startRepl(): Promise<void> {
  console.log(`
  punchlist-qa — interactive mode
  Type a command or "help" to see options. "exit" to quit.
`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '  punchlist> ',
  });

  const originalExit = process.exit;

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'exit' || input === 'quit' || input === 'q') {
      console.log('');
      rl.close();
      return;
    }

    const argv = input.split(/\s+/);

    // Intercept process.exit so commands don't kill the REPL.
    // Known limitation: if a command schedules deferred work (setTimeout, etc.)
    // that calls process.exit after the finally block restores it, the REPL dies.
    // This is acceptable for synchronous CLI commands.
    process.exit = ((code?: number) => {
      throw new ExitIntercepted(code ?? 0);
    }) as never;

    try {
      await main(argv);
    } catch (err) {
      if (err instanceof ExitIntercepted) {
        // Command tried to exit — that's fine in REPL mode
      } else {
        console.error(`  Error: ${err instanceof Error ? err.message : err}`);
      }
    } finally {
      process.exit = originalExit;
    }

    console.log('');
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit = originalExit;
    process.exit(0);
  });
}
