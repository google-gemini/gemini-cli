/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

/**
 * Evals for efficient tool selection - making sure the agent picks
 * the right tool for the job instead of brute-forcing everything.
 *
 * Issue: #23484
 */
describe('efficient tool selection', () => {
  evalTest('USUALLY_PASSES', {
    name: 'uses grep instead of reading every file',
    files: {
      'src/a.ts': 'const x = "hello";',
      'src/b.ts': 'const y = "hello";',
      'src/c.ts': 'const z = "goodbye";',
    },
    prompt: 'find which files contain "hello"',
    assert: async (rig) => {
      const calls = rig.readToolLogs();
      const greps = calls.filter((c) => c.toolRequest.name === 'grep_search');
      const reads = calls.filter((c) => c.toolRequest.name === 'read_file');

      expect(greps.length).toBeGreaterThan(0);
      expect(reads.length).toBeLessThan(3);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'uses wc for line counting',
    files: {
      'big.ts': Array.from({ length: 50 }, (_, i) => `// line ${i}`).join('\n'),
    },
    prompt: 'how many lines in big.ts?',
    assert: async (rig) => {
      const calls = rig.readToolLogs();
      const shells = calls.filter(
        (c) => c.toolRequest.name === 'run_shell_command',
      );

      const usedWc = shells.some((c) => {
        const cmd =
          typeof c.toolRequest.args === 'string'
            ? c.toolRequest.args
            : (c.toolRequest.args as any).command;
        return cmd?.includes('wc');
      });

      expect(usedWc).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'uses find for file counting',
    files: {
      'src/a.ts': '',
      'src/b.ts': '',
      'src/sub/c.ts': '',
    },
    prompt: 'count all .ts files in src recursively',
    assert: async (rig) => {
      const calls = rig.readToolLogs();
      const shells = calls.filter(
        (c) => c.toolRequest.name === 'run_shell_command',
      );

      const usedFind = shells.some((c) => {
        const cmd =
          typeof c.toolRequest.args === 'string'
            ? c.toolRequest.args
            : (c.toolRequest.args as any).command;
        return cmd?.includes('find');
      });

      const greps = calls.filter((c) => c.toolRequest.name === 'grep_search');

      expect(usedFind || greps.length > 0).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'grep finds strings across files efficiently',
    files: {
      'app.ts': 'const v = "SEARCH_ME";',
      'util.ts': '// SEARCH_ME is important',
      'config.ts': 'export const SEARCH_ME = true;',
    },
    prompt: 'find all files with SEARCH_ME',
    assert: async (rig, result) => {
      const calls = rig.readToolLogs();
      const greps = calls.filter((c) => c.toolRequest.name === 'grep_search');

      expect(greps.length).toBeGreaterThan(0);
      expect(result.toLowerCase()).toMatch(/(app|util|config)/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'doesnt read all files when grep works',
    files: {
      'a.ts': 'const token = "SECRET123";',
      'b.ts': 'const other = "normal";',
      'c.ts': '// SECRET123 is the key',
      'd.ts': 'const x = 1;',
    },
    prompt: 'where is SECRET123 defined or used?',
    assert: async (rig) => {
      const calls = rig.readToolLogs();
      const greps = calls.filter((c) => c.toolRequest.name === 'grep_search');
      const reads = calls.filter((c) => c.toolRequest.name === 'read_file');

      expect(greps.length).toBeGreaterThan(0);
      expect(reads.length).toBeLessThan(4);
    },
  });
});
