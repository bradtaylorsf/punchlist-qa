#!/usr/bin/env node
const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === 'interactive' || argv[0] === 'i') {
  const { startRepl } = await import('../dist/cli/repl.js');
  await startRepl();
} else {
  const { main } = await import('../dist/cli/index.js');
  await main(argv);
}
