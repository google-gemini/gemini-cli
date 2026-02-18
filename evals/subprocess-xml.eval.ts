/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Subprocess XML tagging behavior', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should detect successful command execution with exit code 0',
    prompt:
      "Run 'echo Hello' and tell me if it succeeded. Only say 'Yes' or 'No'.",
    assert: async (rig, result) => {
      await rig.waitForToolCall('run_shell_command');
      expect(result.toLowerCase()).toContain('yes');

      const lastRequest = rig.readLastApiRequest();
      expect(lastRequest?.attributes?.request_text).toContain(
        '<exit_code>0</exit_code>',
      );
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should detect failed command execution with non-zero exit code',
    prompt:
      "Run 'ls non_existent_file_12345' and tell me if it failed. Only say 'Yes' or 'No'.",
    assert: async (rig, result) => {
      await rig.waitForToolCall('run_shell_command');
      expect(result.toLowerCase()).toContain('yes');

      const lastRequest = rig.readLastApiRequest();
      expect(lastRequest?.attributes?.request_text).toMatch(
        /<exit_code>[1-9]\d*<\/exit_code>/,
      );
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should correctly parse content from <output> tag',
    prompt: "Run 'echo UNIQUE_STRING_99' and tell me what the output was.",
    assert: async (rig, result) => {
      await rig.waitForToolCall('run_shell_command');
      expect(result).toContain('UNIQUE_STRING_99');
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should correctly parse error messages from <error> tag',
    // We force a process-level error by trying to execute a directory
    prompt:
      "Try to execute the current directory './' as a command and tell me what the error message was.",
    assert: async (rig, result) => {
      await rig.waitForToolCall('run_shell_command');
      // The error message usually contains "Permission denied" or "is a directory"
      expect(result.toLowerCase()).toMatch(/permission denied|is a directory/);

      const lastRequest = rig.readLastApiRequest();
      expect(lastRequest?.attributes?.request_text).toContain('<output>');
      expect(lastRequest?.attributes?.request_text).toContain(
        '<exit_code>126</exit_code>',
      );
    },
  });
});
