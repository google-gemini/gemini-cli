/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { evalTest, validateModelOutput } from './test-helper.js';

describe('file-system', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should be able to read a file',
    params: {
      settings: { tools: { core: ['read_file'] } },
    },
    prompt: 'read the file test.txt and show me its contents',
    beforeRun: async (rig) => {
      rig.createFile('test.txt', 'hello world');
    },
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForToolCall('read_file');
      expect(foundToolCall).toBeTruthy();
      validateModelOutput(result, 'hello world', 'File read test');
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should be able to write a file (file-system)',
    params: {
      settings: { tools: { core: ['write_file', 'replace', 'read_file'] } },
    },
    prompt:
      'Use the write_file tool to edit test.txt to have a "hello world" message.',
    beforeRun: async (rig) => {
      rig.createFile('test.txt', '');
    },
    log: true,
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForAnyToolCall([
        'write_file',
        'edit',
        'replace',
      ]);
      expect(foundToolCall).toBeTruthy();
      const fileContent = rig.readFile('test.txt');
      expect(fileContent.toLowerCase().includes('hello')).toBeTruthy();
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should correctly handle file paths with spaces',
    params: {
      settings: { tools: { core: ['write_file', 'read_file'] } },
    },
    prompt:
      'write "hello" to "my test file.txt" and then stop. Do not perform any other actions.',
    assert: async (rig, result) => {
      const fileName = 'my test file.txt';
      const foundToolCall = await rig.waitForToolCall('write_file');
      expect(foundToolCall).toBeTruthy();
      const newFileContent = rig.readFile(fileName);
      expect(newFileContent).toBe('hello');
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should perform a read-then-write sequence',
    params: {
      settings: { tools: { core: ['read_file', 'replace', 'write_file'] } },
    },
    prompt:
      'Read the version from version.txt and write the next version 1.0.1 back to the file.',
    beforeRun: async (rig) => {
      rig.createFile('version.txt', '1.0.0');
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const readCall = toolLogs.find(
        (log) => log.toolRequest.name === 'read_file',
      );
      const writeCall = toolLogs.find(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(readCall).toBeDefined();
      expect(writeCall).toBeDefined();
      const newFileContent = rig.readFile('version.txt');
      expect(newFileContent).toBe('1.0.1');
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should fail safely when trying to edit a non-existent file',
    params: {
      settings: { tools: { core: ['read_file', 'replace'] } },
    },
    prompt: 'In non_existent.txt, replace "a" with "b"',
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const writeAttempt = toolLogs.find(
        (log) => log.toolRequest.name === 'write_file',
      );
      const successfulReplace = toolLogs.find(
        (log) => log.toolRequest.name === 'replace' && log.toolRequest.success,
      );

      expect(
        writeAttempt,
        'write_file should not have been called',
      ).toBeUndefined();
      expect(
        successfulReplace,
        'A successful replace should not have occurred',
      ).toBeUndefined();

      const filePath = path.join(rig.testDir!, 'non_existent.txt');
      expect(
        existsSync(filePath),
        'The non-existent file should not be created',
      ).toBe(false);
    },
  });
});
