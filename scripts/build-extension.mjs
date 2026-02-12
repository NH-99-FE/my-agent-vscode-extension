import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  external: ['vscode'],
  target: ['node18'],
})

console.log('[esbuild] dist/extension.js built')
