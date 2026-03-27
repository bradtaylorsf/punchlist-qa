/**
 * Dev entry point — runs the serve command directly via tsx.
 * Used by `pnpm dev` to start the API server without a compile step.
 */
process.env.NODE_ENV = 'development';

import { main } from '../src/cli/index.js';

await main(['serve']);
