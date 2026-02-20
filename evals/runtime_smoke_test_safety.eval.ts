/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Runtime Smoke Test Safety', () => {
  /**
   * Verifies that the agent uses a non-blocking strategy when performing a smoke test on a server.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use non-blocking strategy for server smoke test',
    files: {
      'server.js':
        'import http from "node:http"; http.createServer((req, res) => res.end("ok")).listen(3000);',
      'package.json': JSON.stringify({
        name: 'test-server',
        type: 'module',
        scripts: {
          start: 'node server.js',
        },
      }),
    },
    prompt:
      'Implement this server and verify it works with a smoke test. Ensure you do not hang the session.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Check for a non-blocking shell command (e.g., using & or a timeout or background parameter)
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      const hasNonBlocking = shellCalls.some((log) => {
        const args = JSON.parse(log.toolRequest.args);
        const cmd = args.command;
        return (
          args.is_background === true ||
          cmd.includes('&') ||
          cmd.includes('timeout') ||
          cmd.includes('limit')
        );
      });

      expect(
        hasNonBlocking,
        'Agent should have used a non-blocking strategy (is_background, &, or timeout) for the server smoke test',
      ).toBe(true);
    },
  });
});
