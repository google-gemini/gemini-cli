/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileContextManager } from './FileContextManager.js';
import { FileContext, FileDiagnostic } from './memory-interfaces.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock fs module
vi.mock('fs/promises');
vi.mock('crypto');
const mockFs = vi.mocked(fs);
const mockCrypto = vi.mocked(crypto);

describe('FileContextManager', () => {
  let fileContextManager: FileContextManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fileContextManager = new FileContextManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('file tracking', () => {
    it('should track file context creation', async () => {
      const filePath = '/test/example.ts';
      const mockStats = {
        mtime: new Date(),
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      };
      
      mockFs.stat.mockResolvedValue(mockStats as any);
      mockFs.readFile.mockResolvedValue('console.log("hello");');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('hash123'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      expect(context.filePath).toBe(filePath);
      expect(context.size).toBe(1024);
      expect(context.exists).toBe(true);
      expect(context.fileType).toBe('typescript');
      expect(context.contentHash).toBe('hash123');
    });

    it('should handle non-existent files', async () => {
      const filePath = '/test/nonexistent.ts';
      
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      expect(context.filePath).toBe(filePath);
      expect(context.exists).toBe(false);
      expect(context.size).toBe(0);
      expect(context.contentHash).toBe('');
    });

    it('should detect file type from extension', async () => {
      const testCases = [
        { path: '/test/file.ts', expected: 'typescript' },
        { path: '/test/file.js', expected: 'javascript' },
        { path: '/test/file.py', expected: 'python' },
        { path: '/test/file.java', expected: 'java' },
        { path: '/test/file.txt', expected: 'text' },
        { path: '/test/file', expected: 'unknown' },
      ];

      for (const testCase of testCases) {
        const mockStats = {
          mtime: new Date(),
          size: 100,
          isFile: () => true,
          isDirectory: () => false,
        };
        
        mockFs.stat.mockResolvedValue(mockStats as any);
        mockFs.readFile.mockResolvedValue('content');
        mockCrypto.createHash.mockReturnValue({
          update: vi.fn().mockReturnThis(),
          digest: vi.fn().mockReturnValue('hash'),
        } as any);

        const context = await fileContextManager.getOrCreateFileContext(testCase.path);
        expect(context.fileType).toBe(testCase.expected);
      }
    });
  });

  describe('content analysis', () => {
    it('should analyze TypeScript file content', async () => {
      const filePath = '/test/component.tsx';
      const content = `
import React, { useState } from 'react';
import { Button } from './Button';

export interface Props {
  title: string;
  onClick: () => void;
}

export const Component: React.FC<Props> = ({ title, onClick }) => {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={() => setCount(count + 1)}>
        Count: {count}
      </Button>
    </div>
  );
};

export default Component;
      `.trim();

      const mockStats = {
        mtime: new Date(),
        size: content.length,
        isFile: () => true,
        isDirectory: () => false,
      };
      
      mockFs.stat.mockResolvedValue(mockStats as any);
      mockFs.readFile.mockResolvedValue(content);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('content-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      expect(context.metadata.language).toBe('typescript');
      expect(context.metadata.frameworks).toContain('react');
      expect(context.metadata.imports).toContain('react');
      expect(context.metadata.imports).toContain('./Button');
      expect(context.metadata.exports).toContain('Props');
      expect(context.metadata.exports).toContain('Component');
      expect(context.metadata.lineCount).toBeGreaterThan(0);
      expect(context.metadata.tokenCount).toBeGreaterThan(0);
    });

    it('should detect dependencies from import statements', async () => {
      const filePath = '/test/utils.ts';
      const content = `
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { Logger } from './logger';
import { Config } from '../config/config';
import * as helpers from '../../helpers/index';

export const processFile = (filePath: string) => {
  // implementation
};
      `.trim();

      const mockStats = {
        mtime: new Date(),
        size: content.length,
        isFile: () => true,
        isDirectory: () => false,
      };
      
      mockFs.stat.mockResolvedValue(mockStats as any);
      mockFs.readFile.mockResolvedValue(content);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('deps-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      expect(context.dependencies).toContain('/test/logger.ts');
      expect(context.dependencies).toContain('/config/config.ts');
      expect(context.dependencies).toContain('/helpers/index.ts');
      expect(context.metadata.imports).toContain('fs');
      expect(context.metadata.imports).toContain('path');
      expect(context.metadata.imports).toContain('child_process');
    });

    it('should extract function and class definitions', async () => {
      const filePath = '/test/classes.ts';
      const content = `
export class UserService {
  private users: User[] = [];
  
  public async getUser(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }
  
  private validateUser(user: User): boolean {
    return user.id && user.name;
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export function createUser(data: Partial<User>): User {
  return {
    id: generateId(),
    name: data.name || '',
    email: data.email || '',
  };
}

const generateId = (): string => {
  return Math.random().toString(36).substring(2);
};
      `.trim();

      const mockStats = {
        mtime: new Date(),
        size: content.length,
        isFile: () => true,
        isDirectory: () => false,
      };
      
      mockFs.stat.mockResolvedValue(mockStats as any);
      mockFs.readFile.mockResolvedValue(content);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('class-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      const definitions = context.metadata.definitions;
      const classDefinition = definitions.find(d => d.name === 'UserService');
      const functionDefinition = definitions.find(d => d.name === 'createUser');
      const interfaceDefinition = definitions.find(d => d.name === 'User');
      
      expect(classDefinition).toBeDefined();
      expect(classDefinition?.type).toBe('class');
      expect(classDefinition?.access).toBe('public');
      
      expect(functionDefinition).toBeDefined();
      expect(functionDefinition?.type).toBe('function');
      expect(functionDefinition?.access).toBe('public');
      
      expect(interfaceDefinition).toBeDefined();
      expect(interfaceDefinition?.type).toBe('interface');
    });
  });

  describe('dependency tracking', () => {
    it('should update dependents when tracking dependencies', async () => {
      const mainFile = '/test/main.ts';
      const utilsFile = '/test/utils.ts';
      const configFile = '/test/config.ts';

      // Mock main.ts that imports utils.ts and config.ts
      const mainContent = `
import { processData } from './utils';
import { config } from './config';
      `;

      // Setup main file
      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: mainContent.length,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue(mainContent);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('main-hash'),
      } as any);

      const mainContext = await fileContextManager.getOrCreateFileContext(mainFile);
      
      // Update dependencies manually for test
      await fileContextManager.updateDependencies(mainFile, [utilsFile + '.ts', configFile + '.ts']);
      
      // Check that dependencies are tracked
      const updatedMainContext = await fileContextManager.getFileContext(mainFile);
      expect(updatedMainContext?.dependencies).toContain(utilsFile + '.ts');
      expect(updatedMainContext?.dependencies).toContain(configFile + '.ts');
      
      // Check that dependents are updated
      const utilsContext = await fileContextManager.getFileContext(utilsFile + '.ts');
      const configContext = await fileContextManager.getFileContext(configFile + '.ts');
      
      if (utilsContext) {
        expect(utilsContext.dependents).toContain(mainFile);
      }
      if (configContext) {
        expect(configContext.dependents).toContain(mainFile);
      }
    });

    it('should handle circular dependencies', async () => {
      const fileA = '/test/a.ts';
      const fileB = '/test/b.ts';

      // Create contexts for both files
      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue('export const value = 1;');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('hash'),
      } as any);

      await fileContextManager.getOrCreateFileContext(fileA);
      await fileContextManager.getOrCreateFileContext(fileB);
      
      // Set up circular dependency
      await fileContextManager.updateDependencies(fileA, [fileB]);
      await fileContextManager.updateDependencies(fileB, [fileA]);
      
      const contextA = await fileContextManager.getFileContext(fileA);
      const contextB = await fileContextManager.getFileContext(fileB);
      
      expect(contextA?.dependencies).toContain(fileB);
      expect(contextA?.dependents).toContain(fileB);
      expect(contextB?.dependencies).toContain(fileA);
      expect(contextB?.dependents).toContain(fileA);
    });
  });

  describe('diagnostics', () => {
    it('should track file diagnostics', async () => {
      const filePath = '/test/error-file.ts';
      const diagnostics: FileDiagnostic[] = [
        {
          line: 5,
          column: 10,
          message: 'Type "string" is not assignable to type "number"',
          severity: 'error',
          source: 'typescript',
        },
        {
          line: 12,
          column: 1,
          message: 'Missing semicolon',
          severity: 'warning',
          source: 'eslint',
        },
        {
          line: 8,
          column: 15,
          message: 'Consider using const instead of let',
          severity: 'info',
          source: 'eslint',
        },
      ];

      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: 500,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue('const x: number = "string";');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('diag-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      await fileContextManager.updateDiagnostics(filePath, diagnostics);
      
      const updatedContext = await fileContextManager.getFileContext(filePath);
      expect(updatedContext?.diagnostics).toHaveLength(3);
      expect(updatedContext?.diagnostics[0].severity).toBe('error');
      expect(updatedContext?.diagnostics[1].severity).toBe('warning');
      expect(updatedContext?.diagnostics[2].severity).toBe('info');
    });

    it('should clear diagnostics when file is fixed', async () => {
      const filePath = '/test/fixed-file.ts';
      
      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: 200,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue('const x = 42;');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('fixed-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      
      // Add diagnostics
      await fileContextManager.updateDiagnostics(filePath, [
        {
          line: 1,
          column: 1,
          message: 'Error message',
          severity: 'error',
          source: 'typescript',
        },
      ]);
      
      let updatedContext = await fileContextManager.getFileContext(filePath);
      expect(updatedContext?.diagnostics).toHaveLength(1);
      
      // Clear diagnostics
      await fileContextManager.updateDiagnostics(filePath, []);
      
      updatedContext = await fileContextManager.getFileContext(filePath);
      expect(updatedContext?.diagnostics).toHaveLength(0);
    });
  });

  describe('git integration', () => {
    it('should track git status for files', async () => {
      const filePath = '/test/git-file.ts';
      
      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: 300,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue('export const gitFile = true;');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('git-hash'),
      } as any);

      const context = await fileContextManager.getOrCreateFileContext(filePath);
      await fileContextManager.updateGitStatus(filePath, 'modified');
      
      const updatedContext = await fileContextManager.getFileContext(filePath);
      expect(updatedContext?.gitStatus).toBe('modified');
    });

    it('should handle different git statuses', async () => {
      const testStatuses: Array<FileContext['gitStatus']> = [
        'untracked',
        'modified',
        'added',
        'deleted',
        'renamed',
        'clean',
      ];

      for (const status of testStatuses) {
        const filePath = `/test/git-${status}.ts`;
        
        mockFs.stat.mockResolvedValue({
          mtime: new Date(),
          size: 100,
          isFile: () => true,
          isDirectory: () => false,
        } as any);
        mockFs.readFile.mockResolvedValue(`// ${status} file`);
        mockCrypto.createHash.mockReturnValue({
          update: vi.fn().mockReturnThis(),
          digest: vi.fn().mockReturnValue(`${status}-hash`),
        } as any);

        const context = await fileContextManager.getOrCreateFileContext(filePath);
        await fileContextManager.updateGitStatus(filePath, status);
        
        const updatedContext = await fileContextManager.getFileContext(filePath);
        expect(updatedContext?.gitStatus).toBe(status);
      }
    });
  });

  describe('change detection', () => {
    it('should detect file changes via content hash', async () => {
      const filePath = '/test/changing-file.ts';
      const originalContent = 'const x = 1;';
      const modifiedContent = 'const x = 2;';

      // First read
      mockFs.stat.mockResolvedValue({
        mtime: new Date(),
        size: originalContent.length,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue(originalContent);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('original-hash'),
      } as any);

      const originalContext = await fileContextManager.getOrCreateFileContext(filePath);
      expect(originalContext.contentHash).toBe('original-hash');

      // File modified
      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() + 1000), // 1 second later
        size: modifiedContent.length,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue(modifiedContent);
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('modified-hash'),
      } as any);

      const modifiedContext = await fileContextManager.getOrCreateFileContext(filePath);
      expect(modifiedContext.contentHash).toBe('modified-hash');
      expect(modifiedContext.contentHash).not.toBe(originalContext.contentHash);
    });

    it('should track last modification time', async () => {
      const filePath = '/test/time-tracked.ts';
      const earlierTime = new Date('2023-01-01T10:00:00Z');
      const laterTime = new Date('2023-01-01T11:00:00Z');

      // First read
      mockFs.stat.mockResolvedValue({
        mtime: earlierTime,
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
      } as any);
      mockFs.readFile.mockResolvedValue('const x = 1;');
      mockCrypto.createHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('time-hash'),
      } as any);

      const earlierContext = await fileContextManager.getOrCreateFileContext(filePath);
      expect(earlierContext.lastModified).toBe(earlierTime.getTime());

      // Later modification
      mockFs.stat.mockResolvedValue({
        mtime: laterTime,
        size: 100,
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const laterContext = await fileContextManager.getOrCreateFileContext(filePath);
      expect(laterContext.lastModified).toBe(laterTime.getTime());
    });
  });
});