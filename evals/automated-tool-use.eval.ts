/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('automated_tool_use', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should use automated tools (eslint --fix) to fix code style issues',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          description: 'A test project with lint errors',
          scripts: {
            lint: 'eslint .',
          },
          devDependencies: {
            eslint: '^8.56.0',
          },
        },
        null,
        2,
      ),
      '.eslintrc.json': JSON.stringify(
        {
          env: {
            browser: true,
            es2021: true,
            node: true,
          },
          extends: 'eslint:recommended',
          parserOptions: {
            ecmaVersion: 'latest',
          },
          rules: {
            semi: ['error', 'always'],
            quotes: ['error', 'single'],
          },
        },
        null,
        2,
      ),
      'src/file1.js': `const x = "double quotes";\n`,
      'src/file2.js': `const y = 'missing semi'\n`,
    },
    prompt: 'Fix the linter errors in this project. Use npx and pass --yes.',
    assert: async (rig) => {
      // Check if run_shell_command was used with --fix
      const toolCalls = rig.readToolLogs();
      const shellCommands = toolCalls.filter(
        (call) => call.toolRequest.name === 'run_shell_command',
      );

      const hasFixCommand = shellCommands.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            return false;
          }
        }
        const cmd = (args as any)['command'];
        return cmd && cmd.includes('eslint') && cmd.includes('--fix');
      });

      expect(
        hasFixCommand,
        'Expected agent to use eslint --fix via run_shell_command',
      ).toBe(true);
    },
  });
});
