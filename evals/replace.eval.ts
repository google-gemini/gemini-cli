/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('replace', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should be able to replace content in a file',
    params: { settings: { tools: { core: ['replace', 'read_file'] } } },
    prompt: "Replace 'foo' with 'bar' in the file 'file_to_replace.txt'",
    beforeRun: async (rig) => {
      const fileName = 'file_to_replace.txt';
      const originalContent = 'foo content';
      rig.createFile(fileName, originalContent);
    },
    assert: async (rig, result) => {
      const fileName = 'file_to_replace.txt';
      const expectedContent = 'bar content';

      const foundToolCall = await rig.waitForToolCall('replace');
      expect(
        foundToolCall,
        'Expected to find a replace tool call',
      ).toBeTruthy();

      expect(rig.readFile(fileName)).toBe(expectedContent);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should handle $ literally when replacing text ending with $',
    params: { settings: { tools: { core: ['replace', 'read_file'] } } },
    prompt:
      "Open regex.yml and append ' # updated' after the line containing ^[sv]d[a-z]$ without breaking the $ character.",
    beforeRun: async (rig) => {
      const fileName = 'regex.yml';
      const originalContent = "| select('match', '^[sv]d[a-z]$')\n";
      rig.createFile(fileName, originalContent);
    },
    assert: async (rig, result) => {
      const fileName = 'regex.yml';
      const expectedContent = "| select('match', '^[sv]d[a-z]$') # updated\n";

      const foundToolCall = await rig.waitForToolCall('replace');
      expect(
        foundToolCall,
        'Expected to find a replace tool call',
      ).toBeTruthy();

      expect(rig.readFile(fileName)).toBe(expectedContent);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should insert a multi-line block of text',
    params: {
      settings: { tools: { core: ['replace', 'read_file'] } },
    },
    prompt: `In insert_block.txt, replace "<INSERT_TEXT_HERE>" with:
First line
Second line
Third line. Use unix style line endings.`,
    beforeRun: async (rig) => {
      const fileName = 'insert_block.txt';
      const originalContent = 'Line A\n<INSERT_TEXT_HERE>\nLine C';
      rig.createFile(fileName, originalContent);
    },
    assert: async (rig, result) => {
      const fileName = 'insert_block.txt';
      const expectedContent =
        'Line A\nFirst line\nSecond line\nThird line\nLine C';

      const foundToolCall = await rig.waitForToolCall('replace');
      expect(
        foundToolCall,
        'Expected to find a replace tool call',
      ).toBeTruthy();

      expect(rig.readFile(fileName)).toBe(expectedContent);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should delete a block of text',
    params: {
      settings: { tools: { core: ['replace', 'read_file'] } },
    },
    prompt: `In delete_block.txt, delete the entire block from "## DELETE THIS ##" to "## END DELETE ##" including the markers and the newline that follows it.`,
    beforeRun: async (rig) => {
      const fileName = 'delete_block.txt';
      const blockToDelete =
        '## DELETE THIS ##\nThis is a block of text to delete.\n## END DELETE ##';
      const originalContent = `Hello\n${blockToDelete}\nWorld`;
      rig.createFile(fileName, originalContent);
    },
    assert: async (rig, result) => {
      const fileName = 'delete_block.txt';
      const expectedContent = 'Hello\nWorld';

      const foundToolCall = await rig.waitForToolCall('replace');
      expect(
        foundToolCall,
        'Expected to find a replace tool call',
      ).toBeTruthy();

      expect(rig.readFile(fileName)).toBe(expectedContent);
    },
  });
});
