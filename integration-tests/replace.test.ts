/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('replace', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());
  it('should be able to replace content in a file', async () => {
    await rig.setup('should be able to replace content in a file', {
      settings: { tools: { core: ['replace', 'read_file'] } },
    });

    const fileName = 'file_to_replace.txt';
    const originalContent = 'foo content';
    const expectedContent = 'bar content';

    rig.createFile(fileName, originalContent);

    await rig.run({
      args: `Replace 'foo' with 'bar' in the file 'file_to_replace.txt'`,
    });

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it.skip('should handle $ literally when replacing text ending with $', async () => {
    await rig.setup(
      'should handle $ literally when replacing text ending with $',
      { settings: { tools: { core: ['replace', 'read_file'] } } },
    );

    const fileName = 'regex.yml';
    const originalContent = "| select('match', '^[sv]d[a-z]$')\n";
    const expectedContent = "| select('match', '^[sv]d[a-z]$') # updated\n";

    rig.createFile(fileName, originalContent);

    await rig.run({
      args: "Open regex.yml and append ' # updated' after the line containing ^[sv]d[a-z]$ without breaking the $ character.",
    });

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it.skip('should insert a multi-line block of text', async () => {
    await rig.setup('should insert a multi-line block of text', {
      settings: { tools: { core: ['replace', 'read_file'] } },
    });
    const fileName = 'insert_block.txt';
    const originalContent = 'Line A\n<INSERT_TEXT_HERE>\nLine C';
    const newBlock = 'First line\nSecond line\nThird line';
    const expectedContent =
      'Line A\nFirst line\nSecond line\nThird line\nLine C';
    rig.createFile(fileName, originalContent);

    const prompt = `In ${fileName}, replace "<INSERT_TEXT_HERE>" with:\n${newBlock}. Use unix style line endings.`;
    await rig.run({ args: prompt });

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it.skip('should delete a block of text', async () => {
    await rig.setup('should delete a block of text', {
      settings: { tools: { core: ['replace', 'read_file'] } },
    });
    const fileName = 'delete_block.txt';
    const blockToDelete =
      '## DELETE THIS ##\nThis is a block of text to delete.\n## END DELETE ##';
    const originalContent = `Hello\n${blockToDelete}\nWorld`;
    const expectedContent = 'Hello\nWorld';
    rig.createFile(fileName, originalContent);

    await rig.run({
      args: `In ${fileName}, delete the entire block from "## DELETE THIS ##" to "## END DELETE ##" including the markers and the newline that follows it.`,
    });

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });
});
