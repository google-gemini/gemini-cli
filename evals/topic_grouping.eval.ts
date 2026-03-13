/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { CREATE_NEW_TOPIC_TOOL_NAME } from '@google/gemini-cli-core';
import { evalTest, assertModelHasOutput } from './test-helper.js';

describe('topic_grouping', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should use create_new_topic to mark major phase transitions',
    prompt:
      'I want you to fix a bug in src/utils.js. First, read the file to understand the bug, then research if there are any related tests, and finally fix it. Use create_new_topic to organize your work into logical chapters (e.g., Researching, Fixing).',
    files: {
      'src/utils.js':
        'export function add(a, b) { return a - b; } // BUG: should be +',
      'tests/utils.test.js': '// test file',
    },
    assert: async (rig, result) => {
      // Expect at least two topic changes: one for research, one for fixing
      const toolLogs = rig.readToolLogs();
      const topicCalls = toolLogs.filter(
        (log) => log.toolRequest.name === CREATE_NEW_TOPIC_TOOL_NAME,
      );

      expect(
        topicCalls.length,
        `Expected at least 2 topic calls, but got ${topicCalls.length}`,
      ).toBeGreaterThanOrEqual(2);

      // Verify that the topics are distinct and descriptive
      const titles = topicCalls.map((call) => {
        const args = JSON.parse(call.toolRequest.args);
        console.log('Topic call args:', args);
        const title = args.title || '';
        return title.toLowerCase();
      });

      console.log('Observed topic titles:', titles);

      const hasResearch = titles.some(
        (t) =>
          t.includes('research') ||
          t.includes('analyz') ||
          t.includes('understand'),
      );
      const hasFix = titles.some(
        (t) =>
          t.includes('fix') || t.includes('implement') || t.includes('apply'),
      );

      expect(
        hasResearch,
        'Should have a topic call for research/analysis',
      ).toBe(true);
      expect(hasFix, 'Should have a topic call for fixing/implementation').toBe(
        true,
      );

      assertModelHasOutput(result);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should sort create_new_topic to the top of the turn',
    prompt:
      'Immediately start by creating a new topic called "Deep Research" and then list the contents of the current directory. Do both in the same turn if possible.',
    assert: async (rig, result) => {
      // In the same turn, create_new_topic should be sorted to index 0
      const toolLogs = rig.readToolLogs();

      // We look for a turn where both were called
      // Since it's a simple prompt, they should both be in the first turn
      expect(toolLogs.length).toBeGreaterThanOrEqual(2);

      // The first tool call in the logs should be create_new_topic
      // if they were executed in the same batch.
      expect(toolLogs[0].toolRequest.name).toBe(CREATE_NEW_TOPIC_TOOL_NAME);

      assertModelHasOutput(result);
    },
  });
});
