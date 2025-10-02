/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('file-system', () => {
  it('should be able to read a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to read a file');
    rig.createFile('test.txt', 'hello world');

    const result = await rig.run(
      `read the file test.txt and show me its contents`,
    );

    const foundToolCall = await rig.waitForToolCall('read_file');

    // Add debugging information
    if (!foundToolCall || !result.includes('hello world')) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Contains hello world': result.includes('hello world'),
      });
    }

    expect(
      foundToolCall,
      'Expected to find a read_file tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(result, 'hello world', 'File read test');
  });

  it('should be able to write a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to write a file');
    rig.createFile('test.txt', '');

    const result = await rig.run(`edit test.txt to have a hello world message`);

    // Accept multiple valid tools for editing files
    const foundToolCall = await rig.waitForAnyToolCall([
      'write_file',
      'edit',
      'replace',
    ]);

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(
      foundToolCall,
      'Expected to find a write_file, edit, or replace tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output
    validateModelOutput(result, null, 'File write test');

    const fileContent = rig.readFile('test.txt');

    // Add debugging for file content
    if (!fileContent.toLowerCase().includes('hello')) {
      const writeCalls = rig
        .readToolLogs()
        .filter((t) => t.toolRequest.name === 'write_file')
        .map((t) => t.toolRequest.args);

      printDebugInfo(rig, result, {
        'File content mismatch': true,
        'Expected to contain': 'hello',
        'Actual content': fileContent,
        'Write tool calls': JSON.stringify(writeCalls),
      });
    }

    expect(
      fileContent.toLowerCase().includes('hello'),
      'Expected file to contain hello',
    ).toBeTruthy();

    // Log success info if verbose
    if (process.env['VERBOSE'] === 'true') {
      console.log('File written successfully with hello message.');
    }
  });

  it('should correctly handle file paths with spaces', async () => {
    const rig = new TestRig();
    await rig.setup('should correctly handle file paths with spaces');
    const fileName = 'my test file.txt';

    const result = await rig.run(`write "hello" to "${fileName}"`);

    const foundToolCall = await rig.waitForToolCall('write_file');
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(
      foundToolCall,
      'Expected to find a write_file tool call',
    ).toBeTruthy();

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe('hello');
  });

  it('should perform a read-then-write sequence', async () => {
    const rig = new TestRig();
    await rig.setup('should perform a read-then-write sequence');
    const fileName = 'version.txt';
    rig.createFile(fileName, '1.0.0');

    const prompt = `Read the version from ${fileName} and write the next version 1.0.1 back to the file.`;
    const result = await rig.run(prompt);

    await rig.waitForTelemetryReady();
    const toolLogs = rig.readToolLogs();

    const readCall = toolLogs.find(
      (log) => log.toolRequest.name === 'read_file',
    );
    const writeCall = toolLogs.find(
      (log) =>
        log.toolRequest.name === 'write_file' ||
        log.toolRequest.name === 'replace',
    );

    if (!readCall || !writeCall) {
      printDebugInfo(rig, result, { readCall, writeCall });
    }

    expect(readCall, 'Expected to find a read_file tool call').toBeDefined();
    expect(
      writeCall,
      'Expected to find a write_file or replace tool call',
    ).toBeDefined();

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe('1.0.1');
  });

  it.skip('should replace multiple instances of a string', async () => {
    const rig = new TestRig();
    await rig.setup('should replace multiple instances of a string');
    const fileName = 'ambiguous.txt';
    const fileContent = 'Hey there, \ntest line\ntest line';
    const expectedContent = 'Hey there, \nnew line\nnew line';
    rig.createFile(fileName, fileContent);

    const result = await rig.run(
      `replace "test line" with "new line" in ${fileName}`,
    );

    const foundToolCall = await rig.waitForAnyToolCall([
      'replace',
      'write_file',
    ]);
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(
      foundToolCall,
      'Expected to find a replace or write_file tool call',
    ).toBeTruthy();

    const toolLogs = rig.readToolLogs();
    const successfulEdit = toolLogs.some(
      (log) =>
        (log.toolRequest.name === 'replace' ||
          log.toolRequest.name === 'write_file') &&
        log.toolRequest.success,
    );
    if (!successfulEdit) {
      console.error(
        'Expected a successful edit tool call, but none was found.',
      );
      printDebugInfo(rig, result);
    }
    expect(successfulEdit, 'Expected a successful edit tool call').toBeTruthy();

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe(expectedContent);
  });

  it('should fail safely when trying to edit a non-existent file', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should fail safely when trying to edit a non-existent file',
    );
    const fileName = 'non_existent.txt';

    const result = await rig.run(`In ${fileName}, replace "a" with "b"`);

    await rig.waitForTelemetryReady();
    const toolLogs = rig.readToolLogs();

    const readAttempt = toolLogs.find(
      (log) => log.toolRequest.name === 'read_file',
    );
    const writeAttempt = toolLogs.find(
      (log) => log.toolRequest.name === 'write_file',
    );
    const successfulReplace = toolLogs.find(
      (log) => log.toolRequest.name === 'replace' && log.toolRequest.success,
    );

    // The model can either investigate (and fail) or do nothing.
    // If it chose to investigate by reading, that read must have failed.
    if (readAttempt && readAttempt.toolRequest.success) {
      console.error(
        'A read_file attempt succeeded for a non-existent file when it should have failed.',
      );
      printDebugInfo(rig, result);
    }
    if (readAttempt) {
      expect(
        readAttempt.toolRequest.success,
        'If model tries to read the file, that attempt must fail',
      ).toBe(false);
    }

    // CRITICAL: Verify that no matter what the model did, it never successfully
    // wrote or replaced anything.
    if (writeAttempt) {
      console.error(
        'A write_file attempt was made when no file should be written.',
      );
      printDebugInfo(rig, result);
    }
    expect(
      writeAttempt,
      'write_file should not have been called',
    ).toBeUndefined();

    if (successfulReplace) {
      console.error('A successful replace occurred when it should not have.');
      printDebugInfo(rig, result);
    }
    expect(
      successfulReplace,
      'A successful replace should not have occurred',
    ).toBeUndefined();

    // Final verification: ensure the file was not created.
    const filePath = path.join(rig.testDir!, fileName);
    const fileExists = existsSync(filePath);
    expect(fileExists, 'The non-existent file should not be created').toBe(
      false,
    );
  });
});
