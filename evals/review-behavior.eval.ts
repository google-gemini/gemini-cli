/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

const FILES = {
  'package.json': JSON.stringify({
    name: 'review-project',
    version: '1.0.0',
    scripts: {
      test: 'echo "All tests passed!"',
      build: 'tsc'
    },
    dependencies: {
      express: '^4.18.2'
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@types/express': '^4.17.17'
    }
  }, null, 2),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'commonjs',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    },
    include: ['src/**/*']
  }, null, 2),
  'src/index.ts': `
import express from 'express';
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(\`Server listening on port \${port}\`);
});
`.trim(),
  '.gitignore': 'node_modules\\n'
} as const;

describe('review behavior eval', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should not run git status for a trivial code change',
    prompt:
      'Change the response of the "/" route in src/index.ts to say "Hello Universe!" instead of "Hello World!". Make the change and do nothing else.',
    files: FILES,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();
      const statusCalls = toolLogs.filter((log) => {
        if (log.toolRequest.name !== 'run_shell_command') return false;
        try {
          const args = JSON.parse(log.toolRequest.args);
          return args.command && args.command.includes('git status');
        } catch {
          return false;
        }
      });

      expect(statusCalls.length).toBe(0);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should run git status for a non-trivial code change',
    prompt:
      'Refactor the codebase by extracting the express route in src/index.ts into a new module called src/routes.ts. Ensure the application still works. After you finish the code changes, prepare a commit.',
    files: FILES,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();
      const statusCalls = toolLogs.filter((log) => {
        if (log.toolRequest.name !== 'run_shell_command') return false;
        try {
          const args = JSON.parse(log.toolRequest.args);
          return args.command && args.command.includes('git status');
        } catch {
          return false;
        }
      });

      expect(statusCalls.length).toBeGreaterThan(0);
    },
  });
});
