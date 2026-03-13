/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: [
      { in: 'src/extension.ts', out: 'extension' },
      {
        in: 'src/integration-tests/run-test.ts',
        out: 'integration-tests/run-test',
      },
      {
        in: 'src/integration-tests/focus.test.ts',
        out: 'integration-tests/focus.test',
      },
    ],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'dist',
    outExtension: { '.js': '.cjs' },
    external: ['vscode', 'vitest'],
    logLevel: 'silent',
    banner: {
      js: `const import_meta = { url: require('url').pathToFileURL(__filename).href };`,
    },
    define: {
      'import.meta.url': 'import_meta.url',
    },
    alias: {
      punycode: 'punycode/',
    },
    plugins: [esbuildProblemMatcherPlugin],
    loader: { '.node': 'file', '.wasm': 'binary' },
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
