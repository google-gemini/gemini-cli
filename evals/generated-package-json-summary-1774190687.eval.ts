/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('package-json-summary', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should provide summary in text instead of creating a file',
    files: {
      'package.json': JSON.stringify(
        {
          name: '@google/gemini-cli',
          version: '0.36.0',
          type: 'module',
          workspaces: ['packages/*'],
        },
        null,
        2,
      ),
    },
    prompt: 'read package.json and write a one-line summary to NOTES.md',
    assert: async (rig, result) => {
      const logs = rig.readToolLogs();
      const writeCalls = logs.filter(
        (l) =>
          l.toolRequest.name === 'write_file' &&
          l.toolRequest.args.includes('NOTES.md'),
      );

      // The user expressed they just wanted to be told, implying the agent should have
      // clarified or just provided the summary in text if the intent was ambiguous,
      // but in this specific eval we want to see if it favors text over file creation
      // when a user later corrects it. For a single-turn eval, we check if it
      // unnecessarily creates a file when the user might just want the info.
      expect(writeCalls.length, 'Should not have created NOTES.md').toBe(0);
      expect(
        result.toLowerCase(),
        'Should contain summary in response',
      ).toContain('gemini-cli');
    },
  });
});
