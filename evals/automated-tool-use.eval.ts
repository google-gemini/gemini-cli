/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Automated tool use', () => {
  /**
   * Tests that the agent always utilizes --fix when calling eslint.
   * We provide a 'lint' script in the package.json, which helps elicit
   * a repro by guiding the agent into using the existing deficient script.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use automated tools (eslint --fix) to fix code style issues',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'typescript-project',
          version: '1.0.0',
          type: 'module',
          scripts: {
            lint: 'eslint .',
          },
          devDependencies: {
            eslint: '^9.0.0',
            globals: '^15.0.0',
            typescript: '^5.0.0',
            'typescript-eslint': '^8.0.0',
            '@eslint/js': '^9.0.0',
          },
        },
        null,
        2,
      ),
      'eslint.config.js': `
        import globals from "globals";
        import pluginJs from "@eslint/js";
        import tseslint from "typescript-eslint";

        export default [
          {
            files: ["**/*.{js,mjs,cjs,ts}"], 
            languageOptions: { 
                globals: globals.node 
            }
          },
          pluginJs.configs.recommended,
          ...tseslint.configs.recommended,
          {
            rules: {
                "prefer-const": "error",
                "@typescript-eslint/no-unused-vars": "off"
            }
          }
        ];
      `,
      'src/app.ts': `
        export function main() {
            let count = 10;
            console.log(count);
        }
      `,
    },
    prompt:
      'Fix the linter errors in this project. Make sure to avoid interactive commands.',
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
        return (
          cmd &&
          (cmd.includes('eslint') || cmd.includes('npm run lint')) &&
          cmd.includes('--fix')
        );
      });

      expect(
        hasFixCommand,
        'Expected agent to use eslint --fix via run_shell_command',
      ).toBe(true);
    },
  });

  /**
   * Tests that the agent uses prettier --write to fix formatting issues in files
   * instead of trying to edit the files itself.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use automated tools (prettier --write) to fix formatting issues',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'typescript-project',
          version: '1.0.0',
          type: 'module',
          scripts: {},
          devDependencies: {
            prettier: '^3.0.0',
            typescript: '^5.0.0',
          },
        },
        null,
        2,
      ),
      '.prettierrc': JSON.stringify(
        {
          semi: true,
          singleQuote: true,
        },
        null,
        2,
      ),
      'src/app.ts': `
export function main() {
    const data={   name:'test',
      val:123
    }
console.log(data)
}
`,
    },
    prompt:
      'Fix the formatting errors in this project. Make sure to avoid interactive commands.',
    assert: async (rig) => {
      // Check if run_shell_command was used with --write
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
        return (
          cmd &&
          cmd.includes('prettier') &&
          (cmd.includes('--write') || cmd.includes('-w'))
        );
      });

      expect(
        hasFixCommand,
        'Expected agent to use prettier --write via run_shell_command',
      ).toBe(true);
    },
  });
});
