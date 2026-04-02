/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Error recovery', () => {
  /**
   * Ensures the agent handles a malformed JSON file gracefully — reporting
   * the parse error to the user rather than crashing or showing raw stack
   * traces.
   */
  evalTest('USUALLY_PASSES', {
    name: 'handles invalid JSON without exposing stack traces',
    prompt: 'Parse package.json and tell me the project version.',
    files: {
      'package.json': '{ "name": "test", "version": INVALID }',
    },
    assert: async (rig, result) => {
      // Agent should report the problem in plain language.
      expect(
        result,
        'Agent should mention the parsing or syntax issue',
      ).toMatch(/invalid|error|malformed|parse|syntax|cannot|couldn.t/i);

      // Agent should NOT dump raw Node.js / V8 stack traces.
      expect(
        result,
        'Agent should not expose raw stack traces to the user',
      ).not.toMatch(/at Object\.|TypeError:|SyntaxError:/);
    },
  });

  /**
   * Ensures the agent recovers when a script it was asked to run exits with
   * a non-zero status — it should relay the failure information to the user
   * rather than silently swallowing the error.
   */
  evalTest('USUALLY_PASSES', {
    name: 'reports non-zero exit code from a failing script',
    prompt: 'Run test.sh and tell me what happened.',
    files: {
      'test.sh':
        '#!/bin/bash\necho "Error: connection refused" >&2\nexit 1\n',
    },
    assert: async (rig, result) => {
      // Agent should have attempted to run the script.
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest?.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Agent should have called run_shell_command',
      ).toBeGreaterThan(0);

      // Agent should communicate the failure to the user.
      expect(
        result,
        'Agent should report the script failure',
      ).toMatch(/fail|error|exit|connection refused|non.zero/i);
    },
  });

  /**
   * Ensures the agent does not crash or loop infinitely when asked to read
   * a file that does not exist — it should inform the user clearly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'reports missing file instead of crashing',
    prompt: 'Read the contents of config.yaml and summarize it.',
    files: {
      'README.md': '# Test Project\nA sample project.',
    },
    assert: async (rig, result) => {
      // Agent should mention the file is missing / not found.
      expect(
        result,
        'Agent should tell the user the file does not exist',
      ).toMatch(/not found|does not exist|no such file|missing|couldn.t find/i);
    },
  });
});
