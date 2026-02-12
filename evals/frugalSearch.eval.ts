/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

/**
 * Evals to verify that the agent uses search tools efficiently (frugally)
 * by utilizing limiting parameters like `total_max_matches` and `max_matches_per_file`.
 * This ensures the agent doesn't flood the context window with unnecessary search results.
 */
describe('Frugal Search', () => {
  const getGrepParams = (call: any): any => {
    let args = call.toolRequest.args;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch (e) {
        // Ignore parse errors
      }
    }
    return args;
  };

  evalTest('USUALLY_PASSES', {
    name: 'should use targeted search with limit',
    prompt: 'find me a sample usage of path.resolve() in the codebase',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        main: 'dist/index.js',
        scripts: {
          build: 'tsc',
          test: 'vitest',
        },
        dependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
          vitest: '^1.0.0',
        },
      }),
      'src/index.ts': `
        import { App } from './app.ts';
        
        const app = new App();
        app.start();
      `,
      'src/app.ts': `
        import * as path from 'path';
        import { UserController } from './controllers/user.ts';

        export class App {
          constructor() {
            console.log('App initialized');
          }

          public start(): void {
            const userController = new UserController();
            console.log('Static path:', path.resolve(__dirname, '../public'));
          }
        }
      `,
      'src/utils.ts': `
        import * as path from 'path';
        import * as fs from 'fs';

        export function resolvePath(p: string): string {
          return path.resolve(process.cwd(), p);
        }

        export function ensureDir(dirPath: string): void {
          const absolutePath = path.resolve(dirPath);
          if (!fs.existsSync(absolutePath)) {
            fs.mkdirSync(absolutePath, { recursive: true });
          }
        }
      `,
      'src/config.ts': `
        import * as path from 'path';
        
        export const config = {
          dbPath: path.resolve(process.cwd(), 'data/db.sqlite'),
          logLevel: 'info',
        };
      `,
      'src/controllers/user.ts': `
        import * as path from 'path';
        
        export class UserController {
          public getUsers(): any[] {
            console.log('Loading users from:', path.resolve('data/users.json'));
            return [{ id: 1, name: 'Alice' }];
          }
        }
      `,
      'tests/app.test.ts': `
        import { describe, it, expect } from 'vitest';
        import * as path from 'path';

        describe('App', () => {
          it('should resolve paths', () => {
            const p = path.resolve('test');
            expect(p).toBeDefined();
          });
        });
      `,
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const grepCalls = toolCalls.filter(
        (call) => call.toolRequest.name === 'grep_search',
      );

      expect(grepCalls.length).toBeGreaterThan(0);

      const grepParams = grepCalls.map(getGrepParams);

      const hasTotalMaxLimit = grepParams.some(
        (p) => p.total_max_matches !== undefined && p.total_max_matches <= 100,
      );
      expect(
        hasTotalMaxLimit,
        `Expected agent to use a small total_max_matches (<= 100) for a sample usage request. Actual values: ${JSON.stringify(
          grepParams.map((p) => p.total_max_matches),
        )}`,
      ).toBe(true);

      const hasMaxMatchesPerFileLimit = grepParams.some(
        (p) =>
          p.max_matches_per_file !== undefined && p.max_matches_per_file <= 5,
      );
      expect(
        hasMaxMatchesPerFileLimit,
        `Expected agent to use a small max_matches_per_file (<= 5) for a sample usage request. Actual values: ${JSON.stringify(
          grepParams.map((p) => p.max_matches_per_file),
        )}`,
      ).toBe(true);
    },
  });
});
