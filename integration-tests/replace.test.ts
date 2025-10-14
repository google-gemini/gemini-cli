/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig } from './test-helper.js';

describe('replace', () => {
  it('should be able to replace content in a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to replace content in a file');

    const fileName = 'file_to_replace.txt';
    const originalContent = 'foo content';
    const expectedContent = 'bar content';

    rig.createFile(fileName, originalContent);

    await rig.run(`Replace 'foo' with 'bar' in the file 'file_to_replace.txt'`);

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it('should handle $ literally when replacing text ending with $', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should handle $ literally when replacing text ending with $',
    );

    const fileName = 'regex.yml';
    const originalContent = "| select('match', '^[sv]d[a-z]$')\n";
    const expectedContent = "| select('match', '^[sv]d[a-z]$') # updated\n";

    rig.createFile(fileName, originalContent);

    await rig.run(
      "Open regex.yml and append ' # updated' after the line containing ^[sv]d[a-z]$ without breaking the $ character.",
    );

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it('should fail safely when old_string is not found', async () => {
    const rig = new TestRig();
    await rig.setup('should fail safely when old_string is not found', {
      settings: {
        useSmartEdit: false,
        maxToolCalls: 1,
      },
    });
    const fileName = 'no_match.txt';
    const fileContent = 'hello world';
    rig.createFile(fileName, fileContent);

    await rig.run(
      `Make one call to the replace tool to replace the text "goodbye" with "farewell" in ${fileName}.\n
      * Do not read the file.
      * Do not call any other tools.
      * Do not call the replace tool more than once.
      * After the first and only tool call, take no further action, even if the tool call fails.`,
    );

    await rig.waitForTelemetryReady();
    const toolLogs = rig.readToolLogs();

    expect(toolLogs.length, 'Expected exactly one tool call').toBe(1);
    expect(toolLogs[0].toolRequest.name).toBe('replace');
    expect(toolLogs[0].toolRequest.success).toBe(false);

    // Ensure file content is unchanged
    expect(rig.readFile(fileName)).toBe(fileContent);
  });

  it('should insert a multi-line block of text', async () => {
    const rig = new TestRig();
    await rig.setup('should insert a multi-line block of text');
    const fileName = 'insert_block.txt';
    const originalContent = 'Line A\n<INSERT_TEXT_HERE>\nLine C';
    const newBlock = 'First line\nSecond line\nThird line';
    const expectedContent =
      'Line A\nFirst line\nSecond line\nThird line\nLine C';
    rig.createFile(fileName, originalContent);

    const prompt = `In ${fileName}, replace "<INSERT_TEXT_HERE>" with:\n${newBlock}. Use unix style line endings.`;
    await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });

  it('should delete a block of text', async () => {
    const rig = new TestRig();
    await rig.setup('should delete a block of text');
    const fileName = 'delete_block.txt';
    const blockToDelete =
      '## DELETE THIS ##\nThis is a block of text to delete.\n## END DELETE ##';
    const originalContent = `Hello\n${blockToDelete}\nWorld`;
    const expectedContent = 'Hello\nWorld';
    rig.createFile(fileName, originalContent);

    await rig.run(
      `In ${fileName}, delete the entire block from "## DELETE THIS ##" to "## END DELETE ##" including the markers.`,
    );

    const foundToolCall = await rig.waitForToolCall('replace');
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });
});
