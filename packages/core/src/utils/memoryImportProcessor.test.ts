/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { marked } from 'marked';
import { processImports, validateImportPath } from './memoryImportProcessor.js';

// Mock fs/promises
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// Mock console methods to capture warnings
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

// Helper functions using marked for parsing and validation
const parseMarkdown = (content: string) => marked.lexer(content);

const findMarkdownComments = (content: string): string[] => {
  const tokens = parseMarkdown(content);
  const comments: string[] = [];

  function walkTokens(tokenList: unknown[]) {
    for (const token of tokenList) {
      const t = token as { type: string; raw: string; tokens?: unknown[] };
      if (t.type === 'html' && t.raw.includes('<!--')) {
        comments.push(t.raw.trim());
      }
      if (t.tokens) {
        walkTokens(t.tokens);
      }
    }
  }

  walkTokens(tokens);
  return comments;
};

const findCodeBlocks = (
  content: string,
): Array<{ type: string; content: string }> => {
  const tokens = parseMarkdown(content);
  const codeBlocks: Array<{ type: string; content: string }> = [];

  function walkTokens(tokenList: unknown[]) {
    for (const token of tokenList) {
      const t = token as { type: string; text: string; tokens?: unknown[] };
      if (t.type === 'code') {
        codeBlocks.push({
          type: 'code_block',
          content: t.text,
        });
      } else if (t.type === 'codespan') {
        codeBlocks.push({
          type: 'inline_code',
          content: t.text,
        });
      }
      if (t.tokens) {
        walkTokens(t.tokens);
      }
    }
  }

  walkTokens(tokens);
  return codeBlocks;
};

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
      const basePath = path.normalize('/test/path');
      const importedContent = '# Imported Content\nThis is imported.';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      // Use marked to find HTML comments (import markers)
      const comments = findMarkdownComments(result.content);
      expect(comments.some((c) => c.includes('Imported from: ./test.md'))).toBe(
        true,
      );
      expect(
        comments.some((c) => c.includes('End of import from: ./test.md')),
      ).toBe(true);

      // Verify the imported content is present
      expect(result.content).toContain(importedContent);

      // Verify the markdown structure is valid
      const tokens = parseMarkdown(result.content);
      expect(tokens).toBeDefined();
      expect(tokens.length).toBeGreaterThan(0);

      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.resolve(basePath, './test.md'),
        'utf-8',
      );
    });

    it('should import non-md files just like md files', async () => {
      const content = 'Some content @./instructions.txt more content';
      const basePath = path.normalize('/test/path');
      const importedContent =
        '# Instructions\nThis is a text file with markdown.';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(importedContent);

      const result = await processImports(content, basePath, true);

      // Use marked to find import comments
      const comments = findMarkdownComments(result.content);
      expect(
        comments.some((c) => c.includes('Imported from: ./instructions.txt')),
      ).toBe(true);
      expect(
        comments.some((c) =>
          c.includes('End of import from: ./instructions.txt'),
        ),
      ).toBe(true);

      // Use marked to parse and validate the imported content structure
      const tokens = parseMarkdown(result.content);

      // Find headers in the parsed content
      const headers = tokens.filter((token) => token.type === 'heading');
      expect(
        headers.some((h) => (h as { text: string }).text === 'Instructions'),
      ).toBe(true);

      // Verify the imported content is present
      expect(result.content).toContain(importedContent);
      expect(console.warn).not.toHaveBeenCalled();
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.resolve(basePath, './instructions.txt'),
        'utf-8',
      );
    });

    it('should handle circular imports', async () => {
      const content = 'Content @./circular.md more content';
      const basePath = path.normalize('/test/path');
      const circularContent = 'Circular @./main.md content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(circularContent);

      // Set up the import state to simulate we're already processing main.md
      const importState = {
        processedFiles: new Set<string>(),
        maxDepth: 10,
        currentDepth: 0,
        currentFile: path.normalize('/test/path/main.md'), // Simulate we're processing main.md
      };

      const result = await processImports(content, basePath, true, importState);

      // The circular import should be detected when processing the nested import
      expect(result.content).toContain(
        '<!-- File already processed: ./main.md -->',
      );
    });

    it('should handle file not found errors', async () => {
      const content = 'Content @./nonexistent.md more content';
      const basePath = path.normalize('/test/path');

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
      const basePath = path.normalize('/test/path');
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
      const basePath = path.normalize('/test/path');
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
      const basePath = path.normalize('/test/path');
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
      const basePath = path.normalize('/test/path');
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
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
      );

      // Use marked to verify imported content is present
      expect(result.content).toContain(importedContent1);
      expect(result.content).toContain(importedContent2);

      // Use marked to find code blocks and verify the import wasn't processed
      const codeBlocks = findCodeBlocks(result.content);
      const hasUnprocessedImport = codeBlocks.some((block) =>
        block.content.includes('@./should-not-import.md'),
      );
      expect(hasUnprocessedImport).toBe(true);

      // Verify no import comment was created for the code block import
      const comments = findMarkdownComments(result.content);
      expect(comments.some((c) => c.includes('should-not-import.md'))).toBe(
        false,
      );
    });

    it('should ignore imports inside inline code', async () => {
      const content = [
        'Normal content @./should-import.md',
        '`code with import @./should-not-import.md`',
        'More content @./should-import2.md',
      ].join('\n');
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
      );

      // Verify imported content is present
      expect(result.content).toContain(importedContent1);
      expect(result.content).toContain(importedContent2);

      // Use marked to find inline code spans
      const codeBlocks = findCodeBlocks(result.content);
      const inlineCodeSpans = codeBlocks.filter(
        (block) => block.type === 'inline_code',
      );

      // Verify the inline code span still contains the unprocessed import
      expect(
        inlineCodeSpans.some((span) =>
          span.content.includes('@./should-not-import.md'),
        ),
      ).toBe(true);

      // Verify no import comments were created for inline code imports
      const comments = findMarkdownComments(result.content);
      expect(comments.some((c) => c.includes('should-not-import.md'))).toBe(
        false,
      );
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
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
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
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
      );
      expect(result.content).toContain(importedParent);
      expect(result.content).toContain(importedSub);
    });

    it('should reject imports outside project root', async () => {
      const content = 'Outside import: @../../../etc/passwd';
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        projectRoot,
      );
      expect(result.content).toContain(
        '<!-- Import failed: ../../../etc/passwd - Path traversal attempt -->',
      );
    });

    it('should build import tree structure', async () => {
      const content = 'Main content @./nested.md @./simple.md';
      const basePath = path.normalize('/test/project/src');
      const nestedContent = 'Nested @./inner.md content';
      const simpleContent = 'Simple content';
      const innerContent = 'Inner content';

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile
        .mockResolvedValueOnce(nestedContent)
        .mockResolvedValueOnce(simpleContent)
        .mockResolvedValueOnce(innerContent);

      const result = await processImports(content, basePath, true);

      // Use marked to find and validate import comments
      const comments = findMarkdownComments(result.content);
      const importComments = comments.filter((c) =>
        c.includes('Imported from:'),
      );

      expect(importComments.some((c) => c.includes('./nested.md'))).toBe(true);
      expect(importComments.some((c) => c.includes('./simple.md'))).toBe(true);
      expect(importComments.some((c) => c.includes('./inner.md'))).toBe(true);

      // Use marked to validate the markdown structure is well-formed
      const tokens = parseMarkdown(result.content);
      expect(tokens).toBeDefined();
      expect(tokens.length).toBeGreaterThan(0);

      // Verify the content contains expected text using marked parsing
      const textContent = tokens
        .filter((token) => token.type === 'paragraph')
        .map((token) => token.raw)
        .join(' ');

      expect(textContent).toContain('Main content');
      expect(textContent).toContain('Nested');
      expect(textContent).toContain('Simple content');
      expect(textContent).toContain('Inner content');

      // Verify import tree structure
      expect(result.importTree.path).toBe('unknown'); // No currentFile set in test
      expect(result.importTree.imports).toHaveLength(2);

      // First import: nested.md
      expect(result.importTree.imports![0].path).toBe(
        path.normalize('/test/project/src/nested.md'),
      );
      expect(result.importTree.imports![0].imports).toHaveLength(1);
      expect(result.importTree.imports![0].imports![0].path).toBe(
        path.normalize('/test/project/src/inner.md'),
      );
      expect(result.importTree.imports![0].imports![0].imports).toBeUndefined();

      // Second import: simple.md
      expect(result.importTree.imports![1].path).toBe(
        path.normalize('/test/project/src/simple.md'),
      );
      expect(result.importTree.imports![1].imports).toBeUndefined();
    });

    it('should produce flat output in Claude-style with unique files in order', async () => {
      const content = 'Main @./nested.md content @./simple.md';
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
        'flat',
      );

      // Use marked to parse the output and validate structure
      const tokens = parseMarkdown(result.content);
      expect(tokens).toBeDefined();

      // Find all file markers using marked parsing
      const fileMarkers: string[] = [];
      const endMarkers: string[] = [];

      function walkTokens(tokenList: unknown[]) {
        for (const token of tokenList) {
          const t = token as { type: string; raw: string; tokens?: unknown[] };
          if (t.type === 'paragraph' && t.raw.includes('--- File:')) {
            const match = t.raw.match(/--- File: (.+?) ---/);
            if (match) {
              // Normalize the path before adding to fileMarkers
              fileMarkers.push(path.normalize(match[1]));
            }
          }
          if (t.type === 'paragraph' && t.raw.includes('--- End of File:')) {
            const match = t.raw.match(/--- End of File: (.+?) ---/);
            if (match) {
              // Normalize the path before adding to endMarkers
              endMarkers.push(path.normalize(match[1]));
            }
          }
          if (t.tokens) {
            walkTokens(t.tokens);
          }
        }
      }

      walkTokens(tokens);

      // Verify all expected files are present with normalized paths
      const expectedFiles = [
        path.normalize(basePath),
        path.normalize(path.join(basePath, 'nested.md')),
        path.normalize(path.join(basePath, 'simple.md')),
        path.normalize(path.join(basePath, 'inner.md')),
      ];

      expect(fileMarkers).toHaveLength(4);
      expectedFiles.forEach((expectedFile) => {
        const normalizedExpected = path.normalize(expectedFile);
        expect(fileMarkers).toContain(normalizedExpected);
      });

      // Verify content is present
      expect(result.content).toContain(
        'Main @./nested.md content @./simple.md',
      );
      expect(result.content).toContain('Nested @./inner.md content');
      expect(result.content).toContain('Simple content');
      expect(result.content).toContain('Inner content');

      // Verify end markers exist
      expect(endMarkers.length).toBeGreaterThan(0);
    });

    it('should not duplicate files in flat output if imported multiple times', async () => {
      const content = 'Main @./dup.md again @./dup.md';
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
      const dupContent = 'Duplicated content';
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(dupContent);
      const result = await processImports(
        content,
        basePath,
        true,
        undefined,
        projectRoot,
        'flat',
      );
      // Only one file block for dup.md - use normalized path for matching
      const dupPath = path.normalize(path.join(basePath, 'dup.md'));
      // Match file marker with any path separators
      const fileMarker = new RegExp(
        `--- File: ${dupPath.replace(/\\/g, '\\\\')} ---`,
      );
      const matches = (result.content.match(fileMarker) || []).length;
      expect(matches).toBe(1);
      expect(result.content).toContain('Duplicated content');
    });

    it('should handle nested imports in flat output', async () => {
      const content = 'Root @./a.md';
      const basePath = path.normalize('/test/project/src');
      const projectRoot = path.normalize('/test/project');
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
        projectRoot,
        'flat',
      );
      // Should contain all files in order: root, a.md, b.md
      const testPaths = {
        root: basePath,
        a: path.join(basePath, 'a.md'),
        b: path.join(basePath, 'b.md'),
      };

      // Verify all files are present using simple string matching
      expect(result.content).toContain(`--- File: ${testPaths.root} ---`);
      expect(result.content).toContain(`--- File: ${testPaths.a} ---`);
      expect(result.content).toContain(`--- File: ${testPaths.b} ---`);

      // Extract all file markers with their positions
      const markers = [];
      for (const [name, filePath] of Object.entries(testPaths)) {
        const marker = `--- File: ${filePath} ---`;
        const index = result.content.indexOf(marker);
        if (index !== -1) {
          markers.push({
            name,
            index,
            text: marker,
          });
        }
      }

      // Sort markers by their position in the content
      markers.sort((a, b) => a.index - b.index);

      // Verify we found all markers
      expect(markers).toHaveLength(3);

      // Verify the order is root -> a -> b
      expect(markers[0].name).toBe('root');
      expect(markers[1].name).toBe('a');
      expect(markers[2].name).toBe('b');
      expect(result.content).toContain('Root @./a.md');
      expect(result.content).toContain('A @./b.md');
      expect(result.content).toContain('B content');
    });
  });

  describe('validateImportPath', () => {
    it('should reject URLs', () => {
      const basePath = path.normalize('/base');
      const allowedPath = path.normalize('/allowed');
      expect(
        validateImportPath('https://example.com/file.md', basePath, [
          allowedPath,
        ]),
      ).toBe(false);
      expect(
        validateImportPath('http://example.com/file.md', basePath, [
          allowedPath,
        ]),
      ).toBe(false);
      expect(
        validateImportPath('file:///path/to/file.md', basePath, [allowedPath]),
      ).toBe(false);
    });

    it('should allow paths within allowed directories', () => {
      const basePath = path.normalize('/base');
      const allowedPath = path.normalize('/allowed');
      expect(validateImportPath('./file.md', basePath, [basePath])).toBe(true);
      expect(validateImportPath('../file.md', basePath, [allowedPath])).toBe(
        false,
      );
      expect(
        validateImportPath(path.normalize('/allowed/sub/file.md'), basePath, [
          allowedPath,
        ]),
      ).toBe(true);
    });

    it('should reject paths outside allowed directories', () => {
      const basePath = path.normalize('/base');
      const allowedPath = path.normalize('/allowed');
      const forbiddenPath = path.normalize('/forbidden');
      expect(
        validateImportPath(path.join(forbiddenPath, 'file.md'), basePath, [
          allowedPath,
        ]),
      ).toBe(false);
      expect(validateImportPath('../../../file.md', basePath, [basePath])).toBe(
        false,
      );
    });

    it('should handle multiple allowed directories', () => {
      const basePath = path.normalize('/base');
      const allowed1 = path.normalize('/allowed1');
      const allowed2 = path.normalize('/allowed2');
      expect(
        validateImportPath('./file.md', basePath, [allowed1, allowed2]),
      ).toBe(false);
      expect(
        validateImportPath(path.join(allowed1, 'file.md'), basePath, [
          allowed1,
          allowed2,
        ]),
      ).toBe(true);
      expect(
        validateImportPath(path.join(allowed2, 'file.md'), basePath, [
          allowed1,
          allowed2,
        ]),
      ).toBe(true);
    });

    it('should handle relative paths correctly', () => {
      const basePath = path.normalize('/base');
      const parentPath = path.normalize('/parent');
      expect(validateImportPath('file.md', basePath, [basePath])).toBe(true);
      expect(validateImportPath('./file.md', basePath, [basePath])).toBe(true);
      expect(validateImportPath('../file.md', basePath, [parentPath])).toBe(
        false,
      );
    });

    it('should handle absolute paths correctly', () => {
      const basePath = path.normalize('/base');
      const allowedPath = path.normalize('/allowed');
      const forbiddenPath = path.normalize('/forbidden');
      expect(
        validateImportPath(path.join(allowedPath, 'file.md'), basePath, [
          allowedPath,
        ]),
      ).toBe(true);
      expect(
        validateImportPath(path.join(forbiddenPath, 'file.md'), basePath, [
          allowedPath,
        ]),
      ).toBe(false);
    });
  });
});
