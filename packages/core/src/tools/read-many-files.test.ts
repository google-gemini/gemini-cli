/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mockControl } from '../__mocks__/fs/promises.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import path from 'path';
import fs from 'fs'; // Actual fs for setup
import os from 'os';
import { Config } from '../config/config.js';

describe('ReadManyFilesTool', () => {
  let tool: ReadManyFilesTool;
  let tempRootDir: string;
  let tempDirOutsideRoot: string;
  let mockReadFileFn: Mock;

  beforeEach(async () => {
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-root-'),
    );
    tempDirOutsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-external-'),
    );
    fs.writeFileSync(path.join(tempRootDir, '.geminiignore'), 'foo.*');
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfig = {
      getFileService: () => fileService,
      getFileFilteringRespectGitIgnore: () => true,
    } as Partial<Config> as Config;

    tool = new ReadManyFilesTool(tempRootDir, mockConfig);

    mockReadFileFn = mockControl.mockReadFile;
    mockReadFileFn.mockReset();

    mockReadFileFn.mockImplementation(
      async (filePath: fs.PathLike, options?: Record<string, unknown>) => {
        const fp =
          typeof filePath === 'string'
            ? filePath
            : (filePath as Buffer).toString();

        if (fs.existsSync(fp)) {
          const originalFs = await vi.importActual<typeof fs>('fs');
          return originalFs.promises.readFile(fp, options);
        }

        if (fp.endsWith('nonexistent-file.txt')) {
          const err = new Error(
            `ENOENT: no such file or directory, open '${fp}'`,
          );
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        if (fp.endsWith('unreadable.txt')) {
          const err = new Error(`EACCES: permission denied, open '${fp}'`);
          (err as NodeJS.ErrnoException).code = 'EACCES';
          throw err;
        }
        if (fp.endsWith('.png'))
          return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
        if (fp.endsWith('.pdf')) return Buffer.from('%PDF-1.4...'); // PDF start
        if (fp.endsWith('binary.bin'))
          return Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]);

        const err = new Error(
          `ENOENT: no such file or directory, open '${fp}' (unmocked path)`,
        );
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      },
    );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempDirOutsideRoot)) {

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
      fs.rmSync(tempDirOutsideRoot, { recursive: true, force: true });
    }

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
  });

  describe('validateParams', () => {

    it('should handle null and undefined inputs', () => {
      expect(tool.validateParams(null as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );
      expect(tool.validateParams(undefined as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
    });

    it('should handle non-object parameters', () => {
      expect(tool.validateParams('string' as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );
      expect(tool.validateParams(123 as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
    });

    it('should handle paths parameter that is not an array', () => {
      expect(tool.validateParams({ paths: 'single-string' } as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );
      expect(tool.validateParams({ paths: 123 } as any)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
    });

    it('should handle array with non-string elements in paths', () => {
      expect(tool.validateParams({ paths: ['valid.txt', null] } as any)).toBe(
        'Each item in "paths" must be a non-empty string/glob pattern.'
      );
      expect(tool.validateParams({ paths: [123, 'valid.txt'] } as any)).toBe(
        'Each item in "paths" must be a non-empty string/glob pattern.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
    });

    it('should handle whitespace-only strings in paths', () => {
      expect(tool.validateParams({ paths: ['  ', 'valid.txt'] })).toBe(
        'Each item in "paths" must be a non-empty string/glob pattern.'
      );
      expect(tool.validateParams({ paths: ['\t\n'] })).toBe(
        'Each item in "paths" must be a non-empty string/glob pattern.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should handle rapid successive executions', async () => {
      createFile('rapid1.txt', 'rapid content 1');
      createFile('rapid2.txt', 'rapid content 2');
      
      const executions = [];
      for (let i = 0; i < 10; i++) {
        executions.push(
          tool.execute(
            { paths: [i % 2 === 0 ? 'rapid1.txt' : 'rapid2.txt'] },
            new AbortController().signal
          )
        );
      }
      
      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
      });
    });
  });

  describe('getDescription method', () => {
    it('should generate accurate description for simple paths', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('*.txt');
      expect(description).toContain(tempRootDir);
      expect(description).toContain('Excluding:');
      expect(description).toContain('UTF-8');
    });

    it('should handle complex parameter combinations in description', () => {
      const params = {
        paths: ['src/**/*.ts'],
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
        useDefaultExcludes: false
      };
      const description = tool.getDescription(params);
      
      expect(description).toContain('src/**/*.ts');
      expect(description).toContain('**/*.tsx');
      expect(description).toContain('Excluding:');
    });

    it('should mention geminiignore patterns when present', () => {
      const params = { paths: ['*.txt'] };
      const description = tool.getDescription(params);
      
      expect(description).toContain('from .geminiignore');
    });
  });
    });

    it('should handle edge cases in include/exclude arrays', () => {
      expect(tool.validateParams({ paths: ['file.txt'], include: null } as any)).toBe(
        'If provided, "include" must be an array of strings/glob patterns.'
      );
      expect(tool.validateParams({ paths: ['file.txt'], exclude: 'single-string' } as any)).toBe(
        'If provided, "exclude" must be an array of strings/glob patterns.'
      );

  describe('performance and stress tests', () => {
    it('should handle files with extremely long names', async () => {
      const longName = 'a'.repeat(200) + '.txt';
      createFile(longName, 'content with long name');
      
      const params = { paths: [longName] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content.some(c => c.includes('content with long name'))).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(100000);
      createFile('large.txt', largeContent);
      
      const params = { paths: ['large.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      const content = result.llmContent as string[];
      expect(content[0]).toContain(largeContent);
      expect(result.returnDisplay).toContain('Successfully read and concatenated content from **1 file(s)**');
    });

    it('should handle complex nested glob patterns efficiently', async () => {
      for (let i = 1; i <= 10; i++) {
        createFile(`level1/sublevel${i}/file${i}.ts`, `content ${i}`);
        createFile(`level1/sublevel${i}/file${i}.js`, `js content ${i}`);
        createFile(`level1/sublevel${i}/test${i}.spec.ts`, `test content ${i}`);
      }
      
      const params = {
        paths: ['level1/**/file*.ts'],
        exclude: ['**/*.spec.*']
      };
      
      const startTime = Date.now();
      const result = await tool.execute(params, new AbortController().signal);
      const executionTime = Date.now() - startTime;
      
      expect(result.llmContent).toHaveLength(10);
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle maximum path length scenarios', async () => {
      // Create deep nested directory structure
      let deepPath = "level0";
      for (let i = 1; i < 20; i++) {
        deepPath = `${deepPath}/level${i}`;
      }

      fs.mkdirSync(path.join(tempRootDir, deepPath), { recursive: true });
      createFile(`${deepPath}/deep-file.txt`, 'deep content');
      
      const params = { paths: ['**/deep-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      
      if (result.llmContent.length > 0) {
        const content = result.llmContent as string[];
        expect(content.some(c => c.includes('deep content'))).toBe(true);
      }
    });

    it('should return error if paths array contains an empty string', () => {
      const params = { paths: ['file1.txt', ''] };
      expect(tool.validateParams(params)).toBe(
        'Each item in "paths" must be a non-empty string/glob pattern.',
      );
    });

    it('should return error if include array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        include: ['*.ts', 123] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'If provided, "include" must be an array of strings/glob patterns.',
      );
    });

    it('should return error if exclude array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        exclude: ['*.log', {}] as string[],
      };
      expect(tool.validateParams(params)).toBe(
        'If provided, "exclude" must be an array of strings/glob patterns.',
      );
    });
  });

  describe('execute', () => {
    const createFile = (filePath: string, content = '') => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    };
    const createBinaryFile = (filePath: string, data: Uint8Array) => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, data);
    };

    it('should read a single specified file', async () => {
      createFile('file1.txt', 'Content of file1');
      const params = { paths: ['file1.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        '--- file1.txt ---\n\nContent of file1\n\n',
      ]);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should read multiple specified files', async () => {
      createFile('file1.txt', 'Content1');
      createFile('subdir/file2.js', 'Content2');
      const params = { paths: ['file1.txt', 'subdir/file2.js'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(
        content.some((c) => c.includes('--- file1.txt ---\n\nContent1\n\n')),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes('--- subdir/file2.js ---\n\nContent2\n\n'),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should handle glob patterns', async () => {
      createFile('file.txt', 'Text file');
      createFile('another.txt', 'Another text');
      createFile('sub/data.json', '{}');
      const params = { paths: ['*.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(
        content.some((c) => c.includes('--- file.txt ---\n\nText file\n\n')),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes('--- another.txt ---\n\nAnother text\n\n'),
        ),
      ).toBe(true);
      expect(content.find((c) => c.includes('sub/data.json'))).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should respect exclude patterns', async () => {
      createFile('src/main.ts', 'Main content');
      createFile('src/main.test.ts', 'Test content');
      const params = { paths: ['src/**/*.ts'], exclude: ['**/*.test.ts'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(content).toEqual(['--- src/main.ts ---\n\nMain content\n\n']);
      expect(
        content.find((c) => c.includes('src/main.test.ts')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should handle non-existent specific files gracefully', async () => {
      const params = { paths: ['nonexistent-file.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        'No files matching the criteria were found or all were skipped.',
      ]);
      expect(result.returnDisplay).toContain(
        'No files were read and concatenated based on the criteria.',
      );
    });

    it('should use default excludes', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'] };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(content).toEqual(['--- src/app.js ---\n\napp code\n\n']);
      expect(
        content.find((c) => c.includes('node_modules/some-lib/index.js')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should NOT use default excludes if useDefaultExcludes is false', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'], useDefaultExcludes: false };
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(
        content.some((c) =>
          c.includes('--- node_modules/some-lib/index.js ---\n\nlib code\n\n'),
        ),
      ).toBe(true);
      expect(
        content.some((c) => c.includes('--- src/app.js ---\n\napp code\n\n')),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should include images as inlineData parts if explicitly requested by extension', async () => {
      createBinaryFile(
        'image.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['*.png'] }; // Explicitly requesting .png
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should include images as inlineData parts if explicitly requested by name', async () => {
      createBinaryFile(
        'myExactImage.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['myExactImage.png'] }; // Explicitly requesting by full name
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
    });

    it('should skip PDF files if not explicitly requested by extension or name', async () => {
      createBinaryFile('document.pdf', Buffer.from('%PDF-1.4...'));
      createFile('notes.txt', 'text notes');
      const params = { paths: ['*'] }; // Generic glob, not specific to .pdf
      const result = await tool.execute(params, new AbortController().signal);
      const content = result.llmContent as string[];
      expect(
        content.some(
          (c) => typeof c === 'string' && c.includes('--- notes.txt ---'),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain('**Skipped 1 item(s):**');
      expect(result.returnDisplay).toContain(
        '- `document.pdf` (Reason: asset file (image/pdf) was not explicitly requested by name or extension)',
      );
    });

    it('should include PDF files as inlineData parts if explicitly requested by extension', async () => {
      createBinaryFile('important.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['*.pdf'] }; // Explicitly requesting .pdf files
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('should include PDF files as inlineData parts if explicitly requested by name', async () => {
      createBinaryFile('report-final.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['report-final.pdf'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('should return error if path is ignored by a .geminiignore pattern', async () => {
      createFile('foo.bar', '');
      createFile('bar.ts', '');
      createFile('foo.quux', '');
      const params = { paths: ['foo.bar', 'bar.ts', 'foo.quux'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.returnDisplay).not.toContain('foo.bar');
      expect(result.returnDisplay).not.toContain('foo.quux');
      expect(result.returnDisplay).toContain('bar.ts');
    });
  });
});
  });
});
