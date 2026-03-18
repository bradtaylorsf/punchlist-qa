import { build } from 'esbuild';

const isProd = process.env.NODE_ENV === 'production';

await build({
  entryPoints: ['src/widget/widget.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'PunchlistWidget',
  outfile: 'dist/widget.js',
  minify: isProd,
  target: 'es2020',
  sourcemap: !isProd,
});

console.log('  Widget bundled → dist/widget.js');
