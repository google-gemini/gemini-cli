/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { processImports, validateImportPath } from './memoryImportProcessor.js';

// Mock fs/promises
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// Mock console methods to capture warnings
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

describe('memoryImportProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
  });

  describe('processImports', () => {
    it('should process basic md file imports', async () => {
      const content = 'Some content @./test.md more content';
      const basePath = '/test/path';
      const importedContent = '# Imported Content\nThis is imported.';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain('<!-- Imported from: ./test.md -->');
      expect(result.content).toContain(importedContent);
      expect(result.content).toContain(
        '<!-- End of import from: ./test.md -->',
      );
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.resolve(basePath, './test.md'),
        'utf-8',
      );
    });

    it('should import non-md files just like md files', async () => {
      const content = 'Some content @./instructions.txt more content';
      const basePath = '/test/path';
      const importedContent = 'This is a text file.';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain(
        '<!-- Imported from: ./instructions.txt -->',
      );
      expect(result.content).toContain(importedContent);
      expect(result.content).toContain(
        '<!-- End of import from: ./instructions.txt -->',
      );
      expect(console.warn).not.toHaveBeenCalled();
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.resolve(basePath, './instructions.txt'),
        'utf-8',
      );
    });

    it('should handle circular imports', async () => {
      const content = 'Content @./circular.md more content';
      const basePath = '/test/path';
      const circularContent = 'Circular @./main.md content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(circularContent);

      // Set up the import state to simulate we're already processing main.md
      const importState = {
        processedFiles: new Set<string>(),
        maxDepth: 10,
        currentDepth: 0,
        currentFile: '/test/path/main.md', // Simulate we're processing main.md
      };

      const result = await processImports(content, basePath, true, importState);

      // The circular import should be detected when processing the nested import
      expect(result.content).toContain(
        '<!-- File already processed: ./main.md -->',
      );
    });

    it('should handle file not found errors', async () => {
      const content = 'Content @./nonexistent.md more content';
      const basePath = '/test/path';

      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain(
        '<!-- Import failed: ./nonexistent.md - File not found -->',
      );
      expect(console.error).toHaveBeenCalledWith(
        '[ERROR] [ImportProcessor]',
        'Failed to import ./nonexistent.md: File not found',
      );
    });

    it('should respect max depth limit', async () => {
      const content = 'Content @./deep.md more content';
      const basePath = '/test/path';
      const deepContent = 'Deep @./deeper.md content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(deepContent);

      const importState = {
        processedFiles: new Set<string>(),
        maxDepth: 1,
        currentDepth: 1,
      };

      const result = await processImports(content, basePath, true, importState);

      expect(console.warn).toHaveBeenCalledWith(
        '[WARN] [ImportProcessor]',
        'Maximum import depth (1) reached. Stopping import processing.',
      );
      expect(result.content).toBe(content);
    });

    it('should handle nested imports recursively', async () => {
      const content = 'Main @./nested.md content';
      const basePath = '/test/path';
      const nestedContent = 'Nested @./inner.md content';
      const innerContent = 'Inner content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(nestedContent)
        .mockResolvedValueOnce(innerContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain('<!-- Imported from: ./nested.md -->');
      expect(result.content).toContain('<!-- Imported from: ./inner.md -->');
      expect(result.content).toContain(innerContent);
    });

    it('should handle absolute paths in imports', async () => {
      const content = 'Content @/absolute/path/file.md more content';
      const basePath = '/test/path';
      const importedContent = 'Absolute path content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain(
        '<!-- Import failed: /absolute/path/file.md - Path traversal attempt -->',
      );
    });

    it('should handle multiple imports in same content', async () => {
      const content = 'Start @./first.md middle @./second.md end';
      const basePath = '/test/path';
      const firstContent = 'First content';
      const secondContent = 'Second content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(firstContent)
        .mockResolvedValueOnce(secondContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain('<!-- Imported from: ./first.md -->');
      expect(result.content).toContain('<!-- Imported from: ./second.md -->');
      expect(result.content).toContain(firstContent);
      expect(result.content).toContain(secondContent);
    });

    it('should ignore imports inside code blocks', async () => {
      const content = [
        'Normal content @./should-import.md',
        '```',
        'code block with @./should-not-import.md',
        '```',
        'More content @./should-import2.md',
      ].join('\n');
      const basePath = '/test/project/src';
      const importedContent1 = 'Imported 1';
      const importedContent2 = 'Imported 2';
      // Only the imports outside code blocks should be processed
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(importedContent1)
        .mockResolvedValueOnce(importedContent2);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
      );
      expect(result.content).toContain(importedContent1);
      expect(result.content).toContain(importedContent2);
      expect(result.content).toContain('@./should-not-import.md'); // Should remain as-is
    });

    it('should ignore imports inside inline code', async () => {
      const content = [
        'Normal content @./should-import.md',
        '`code with import @./should-not-import.md`',
        'More content @./should-import2.md',
      ].join('\n');
      const basePath = '/test/project/src';
      const importedContent1 = 'Imported 1';
      const importedContent2 = 'Imported 2';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(importedContent1)
        .mockResolvedValueOnce(importedContent2);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
      );
      expect(result.content).toContain(importedContent1);
      expect(result.content).toContain(importedContent2);
    });

    it('should handle nested tokens and non-unique content correctly', async () => {
      // This test verifies the robust findCodeRegions implementation
      // that recursively walks the token tree and handles non-unique content
      const content = [
        'Normal content @./should-import.md',
        'Paragraph with `inline code @./should-not-import.md` and more text.',
        'Another paragraph with the same `inline code @./should-not-import.md` text.',
        'More content @./should-import2.md',
      ].join('\n');
      const basePath = '/test/project/src';
      const importedContent1 = 'Imported 1';
      const importedContent2 = 'Imported 2';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(importedContent1)
        .mockResolvedValueOnce(importedContent2);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
      );

      // Should process imports outside code regions
      expect(result.content).toContain(importedContent1);
      expect(result.content).toContain(importedContent2);

      // Should preserve imports inside inline code (both occurrences)
      expect(result.content).toContain('`inline code @./should-not-import.md`');

      // Should not have processed the imports inside code regions
      expect(result.content).not.toContain(
        '<!-- Imported from: ./should-not-import.md -->',
      );
    });

    it('should allow imports from parent and subdirectories within project root', async () => {
      const content =
        'Parent import: @../parent.md Subdir import: @./components/sub.md';
      const basePath = '/test/project/src';
      const importedParent = 'Parent file content';
      const importedSub = 'Subdir file content';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(importedParent)
        .mockResolvedValueOnce(importedSub);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
      );
      expect(result.content).toContain(importedParent);
      expect(result.content).toContain(importedSub);
    });

    it('should reject imports outside project root', async () => {
      const content = 'Outside import: @../../../etc/passwd';
      const basePath = '/test/project/src';
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
      );
      expect(result.content).toContain(
        '<!-- Import failed: ../../../etc/passwd - Path traversal attempt -->',
      );
    });

    it('should build import tree structure', async () => {
      const content = 'Main content @./nested.md @./simple.md';
      const basePath = '/test/project/src';
      const nestedContent = 'Nested @./inner.md content';
      const simpleContent = 'Simple content';
      const innerContent = 'Inner content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(nestedContent)
        .mockResolvedValueOnce(simpleContent)
        .mockResolvedValueOnce(innerContent);

      const result = await processImports(content, basePath, true);

      expect(result.content).toContain('<!-- Imported from: ./nested.md -->');
      expect(result.content).toContain('<!-- Imported from: ./simple.md -->');
      expect(result.content).toContain('<!-- Imported from: ./inner.md -->');

      // Verify import tree structure
      expect(result.importTree.path).toBe('unknown'); // No currentFile set in test
      expect(result.importTree.imports).toHaveLength(2);

      // First import: nested.md
      expect(result.importTree.imports![0].path).toBe(
        '/test/project/src/nested.md',
      );
      expect(result.importTree.imports![0].imports).toHaveLength(1);
      expect(result.importTree.imports![0].imports![0].path).toBe(
        '/test/project/src/inner.md',
      );
      expect(result.importTree.imports![0].imports![0].imports).toBeUndefined();

      // Second import: simple.md
      expect(result.importTree.imports![1].path).toBe(
        '/test/project/src/simple.md',
      );
      expect(result.importTree.imports![1].imports).toBeUndefined();
    });

    it('should produce flat output in Claude-style with unique files in order', async () => {
      const content = 'Main @./nested.md content @./simple.md';
      const basePath = '/test/project/src';
      const nestedContent = 'Nested @./inner.md content';
      const simpleContent = 'Simple content';
      const innerContent = 'Inner content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(nestedContent)
        .mockResolvedValueOnce(simpleContent)
        .mockResolvedValueOnce(innerContent);

      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
        'flat',
      );

      // Should contain all files, each only once, in order of first encounter
      expect(result.content).toContain('--- File: /test/project/src ---');
      expect(result.content).toContain(
        '--- File: /test/project/src/nested.md ---',
      );
      expect(result.content).toContain(
        '--- File: /test/project/src/simple.md ---',
      );
      expect(result.content).toContain(
        '--- File: /test/project/src/inner.md ---',
      );
      // Should not contain duplicate file blocks
      expect(result.content.match(/--- File:/g)?.length).toBe(4);
      // Should contain the content of each file
      expect(result.content).toContain(
        'Main @./nested.md content @./simple.md',
      );
      expect(result.content).toContain('Nested @./inner.md content');
      expect(result.content).toContain('Simple content');
      expect(result.content).toContain('Inner content');
      // Should use Claude-style markers
      expect(result.content).toContain(
        '--- End of File: /test/project/src/inner.md ---',
      );
    });

    it('should not duplicate files in flat output if imported multiple times', async () => {
      const content = 'Main @./dup.md again @./dup.md';
      const basePath = '/test/project/src';
      const dupContent = 'Duplicated content';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(dupContent);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
        'flat',
      );
      // Only one file block for dup.md
      expect(
        result.content.match(/--- File: \/test\/project\/src\/dup.md ---/g)
          ?.length,
      ).toBe(1);
      expect(result.content).toContain('Duplicated content');
    });

    it('should handle nested imports in flat output', async () => {
      const content = 'Root @./a.md';
      const basePath = '/test/project/src';
      const aContent = 'A @./b.md';
      const bContent = 'B content';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(aContent)
        .mockResolvedValueOnce(bContent);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        '/test/project',
        'flat',
      );
      // Should contain all files in order: root, a.md, b.md
      expect(result.content).toMatch(
        /--- File: \/test\/project\/src ---[\s\S]*--- File: \/test\/project\/src\/a.md ---[\s\S]*--- File: \/test\/project\/src\/b.md ---/,
      );
      expect(result.content).toContain('Root @./a.md');
      expect(result.content).toContain('A @./b.md');
      expect(result.content).toContain('B content');
    });
  });

  describe('validateImportPath', () => {
    it('should reject URLs', () => {
      expect(
        validateImportPath('https://example.com/file.md', '/base', [
          '/allowed',
        ]),
      ).toBe(false);
      expect(
        validateImportPath('http://example.com/file.md', '/base', ['/allowed']),
      ).toBe(false);
      expect(
        validateImportPath('file:///path/to/file.md', '/base', ['/allowed']),
      ).toBe(false);
    });

    it('should allow paths within allowed directories', () => {
      expect(validateImportPath('./file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('../file.md', '/base', ['/allowed'])).toBe(
        false,
      );
      expect(
        validateImportPath('/allowed/sub/file.md', '/base', ['/allowed']),
      ).toBe(true);
    });

    it('should reject paths outside allowed directories', () => {
      expect(
        validateImportPath('/forbidden/file.md', '/base', ['/allowed']),
      ).toBe(false);
      expect(validateImportPath('../../../file.md', '/base', ['/base'])).toBe(
        false,
      );
    });

    it('should handle multiple allowed directories', () => {
      expect(
        validateImportPath('./file.md', '/base', ['/allowed1', '/allowed2']),
      ).toBe(false);
      expect(
        validateImportPath('/allowed1/file.md', '/base', [
          '/allowed1',
          '/allowed2',
        ]),
      ).toBe(true);
      expect(
        validateImportPath('/allowed2/file.md', '/base', [
          '/allowed1',
          '/allowed2',
        ]),
      ).toBe(true);
    });

    it('should handle relative paths correctly', () => {
      expect(validateImportPath('file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('./file.md', '/base', ['/base'])).toBe(true);
      expect(validateImportPath('../file.md', '/base', ['/parent'])).toBe(
        false,
      );
    });

    it('should handle absolute paths correctly', () => {
      expect(
        validateImportPath('/allowed/file.md', '/base', ['/allowed']),
      ).toBe(true);
      expect(
        validateImportPath('/forbidden/file.md', '/base', ['/allowed']),
      ).toBe(false);
    });
  });
});
