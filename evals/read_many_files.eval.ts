/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('read_many_files', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses read_many_files when asked to inspect multiple configuration files in a directory',
    files: {
      'config/app.json': '{\n  "name": "my-app",\n  "version": "1.0.0"\n}',
      'config/database.json': '{\n  "host": "localhost",\n  "port": 5432\n}',
      'config/logging.json': '{\n  "level": "info"\n}',
    },
    prompt:
      'Inspect and summarize all configuration JSON files in the config/ directory.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_many_files', 'read_file']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['read_many_files', 'read_file'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use read_many_files to inspect multiple files in batch',
      ).toBe('read_many_files');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses read_file instead of read_many_files when asked to read a single file',
    files: {
      'src/index.ts': 'console.log("Hello World");',
    },
    prompt: 'Read the file src/index.ts and summarize what it does.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_file', 'read_many_files']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['read_file', 'read_many_files'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use read_file for a single file instead of read_many_files',
      ).toBe('read_file');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
