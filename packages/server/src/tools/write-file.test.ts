/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WriteFileTool } from './write-file.js';
import { FileDiff, ToolConfirmationOutcome } from './tools.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let tempDir: string;
  // Using a subdirectory within the OS temp directory for the root to avoid potential permission issues.
  const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-test-root');

  beforeEach(() => {
    // Create a unique temporary directory for files created outside the root (for testing boundary conditions)
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'write-file-test-external-'),
    );
    // Ensure the rootDir for the tool exists
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }
    tool = new WriteFileTool(rootDir);
  });

  afterEach(() => {
    // Clean up the temporary directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  describe('validateToolParams', () => {
    it('should return null for valid absolute path within root', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params = { file_path: 'test.txt', content: 'hello' };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });

    it('should return error for path outside root', () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = {
        file_path: outsidePath,
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be within the root directory/,
      );
    });

    it('should return null for path that is the root itself', () => {
      const params = {
        file_path: rootDir, // Attempting to write to the root directory itself (as a file)
        content: 'hello',
      };
      // This is a tricky case. The validation should allow it if it's treated as a file path.
      // The actual write operation might fail if it's a directory, but validation should pass.
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for path that is just / and root is not /', () => {
      const params = { file_path: path.resolve('/'), content: 'hello' };
      if (rootDir === path.resolve('/')) {
        // This case would only occur if the test runner somehow sets rootDir to actual '/', which is highly unlikely and unsafe.
        expect(tool.validateToolParams(params)).toBeNull();
      } else {
        expect(tool.validateToolParams(params)).toMatch(
          /File path must be within the root directory/,
        );
      }
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return false if params are invalid (relative path)', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toBe(false);
    });

    it('should return false if params are invalid (outside root)', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toBe(false);
    });

    it('should request confirmation for valid params if file does not exist', async () => {
      const filePath = path.join(rootDir, 'new_file.txt');
      const params = { file_path: filePath, content: 'new content' };
      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Write: ${path.basename(filePath)}`,
          fileName: 'new_file.txt',
          fileDiff: expect.any(String),
        }),
      );
    });
  });

  describe('execute', () => {
    it('should return error if params are invalid (relative path)', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/Error: File path must be absolute/);
    });

    it('should return error if params are invalid (path outside root)', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(
        /Error: File path must be within the root directory/,
      );
    });

    it('should write a new file and return diff', async () => {
      const filePath = path.join(rootDir, 'execute_new_file.txt');
      const content = 'Hello from execute!';
      const params = { file_path: filePath, content };

      const confirmDetails = await tool.shouldConfirmExecute(params);
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(
        /Successfully created and wrote to new file/,
      );
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
      const display = result.returnDisplay as FileDiff; // Type assertion
      expect(display.fileName).toBe('execute_new_file.txt');
      // For new files, the diff will include the filename in the "Original" header
      expect(display.fileDiff).toMatch(/--- execute_new_file.txt\tOriginal/);
      expect(display.fileDiff).toMatch(/\+\+\+ execute_new_file.txt\tWritten/);
      expect(display.fileDiff).toMatch(content);
    });

    it('should overwrite an existing file and return diff', async () => {
      const filePath = path.join(rootDir, 'execute_existing_file.txt');
      const initialContent = 'Initial content.';
      const newContent = 'Overwritten content!';
      fs.writeFileSync(filePath, initialContent, 'utf8');

      const params = { file_path: filePath, content: newContent };

      const confirmDetails = await tool.shouldConfirmExecute(params);
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/Successfully overwrote file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
      const display = result.returnDisplay as FileDiff; // Type assertion
      expect(display.fileName).toBe('execute_existing_file.txt');
      expect(display.fileDiff).toMatch(initialContent);
      expect(display.fileDiff).toMatch(newContent);
    });
  });
});
