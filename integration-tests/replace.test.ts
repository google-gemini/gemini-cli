/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('replace', () => {
  it('should be able to replace content in a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to replace content in a file');

    const fileName = 'file_to_replace.txt';
    const originalContent = 'original content';
    const expectedContent = 'replaced content';

    rig.createFile(fileName, originalContent);
    const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('replace');

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(
      result,
      ['replaced', 'file_to_replace.txt'],
      'Replace content test',
    );

    const newFileContent = rig.readFile(fileName);

    // Add debugging for file content
    if (newFileContent !== expectedContent) {
      console.error('File content mismatch - Debug info:');
      console.error('Expected:', expectedContent);
      console.error('Actual:', newFileContent);
      console.error(
        'Tool calls:',
        rig.readToolLogs().map((t) => ({
          name: t.toolRequest.name,
          args: t.toolRequest.args,
        })),
      );
    }

    expect(newFileContent).toBe(expectedContent);

    // Log success info if verbose
    vi.stubEnv('VERBOSE', 'true');
    if (process.env['VERBOSE'] === 'true') {
      console.log('File replaced successfully. New content:', newFileContent);
    }
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

    const prompt =
      "Open regex.yml and append ' # updated' after the line containing ^[sv]d[a-z]$ without breaking the $ character.";

    const result = await rig.run(prompt);
    const foundToolCall = await rig.waitForToolCall('replace');

    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    validateModelOutput(result, ['regex.yml'], 'Replace $ literal test');

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe(expectedContent);
  });

  it('should fail safely when old_string is not found', async () => {
    const rig = new TestRig();
    await rig.setup('should fail safely when old_string is not found');
    const fileName = 'no_match.txt';
    const fileContent = 'hello world';
    rig.createFile(fileName, fileContent);

    const prompt = `replace "goodbye" with "farewell" in ${fileName}`;
    await rig.run(prompt);

    await rig.waitForTelemetryReady();
    const toolLogs = rig.readToolLogs();

    const replaceAttempt = toolLogs.find(
      (log) => log.toolRequest.name === 'replace',
    );
    const readAttempt = toolLogs.find(
      (log) => log.toolRequest.name === 'read_file',
    );

    // VERIFY: The model must have at least tried to read the file or perform a replace.
    expect(
      readAttempt || replaceAttempt,
      'Expected model to attempt a read_file or replace',
    ).toBeDefined();

    // If the model tried to replace, that specific attempt must have failed.
    if (replaceAttempt) {
      if (replaceAttempt.toolRequest.success) {
        console.error(
          'The replace tool succeeded when it was expected to fail',
        );
        console.error('Tool call args:', replaceAttempt.toolRequest.args);
      }
      expect(
        replaceAttempt.toolRequest.success,
        'If replace is called, it must fail',
      ).toBe(false);
    }

    // CRITICAL: The final content of the file must be unchanged.
    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe(fileContent);
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

    const prompt = `In ${fileName}, replace "<INSERT_TEXT_HERE>" with:\n${newBlock}`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('replace');
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    const newFileContent = rig.readFile(fileName);

    expect(newFileContent.replace(/\r\n/g, '\n')).toBe(
      expectedContent.replace(/\r\n/g, '\n'),
    );
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

    const prompt = `In ${fileName}, delete the entire block from "## DELETE THIS ##" to "## END DELETE ##" including the markers.`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('replace');
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    const newFileContent = rig.readFile(fileName);

    expect(newFileContent).toBe(expectedContent);
  });
});
