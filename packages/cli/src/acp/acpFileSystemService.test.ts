/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';
import { AcpFileSystemService } from './acpFileSystemService.js';
import type { AgentSideConnection } from '@agentclientprotocol/sdk';
import type { FileSystemService } from '@google/gemini-cli-core';
import os from 'node:os';

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(),
  },
}));

describe('AcpFileSystemService', () => {
  let mockConnection: Mocked<AgentSideConnection>;
  let mockFallback: Mocked<FileSystemService>;
  let service: AcpFileSystemService;

  beforeEach(() => {
    mockConnection = {
      requestPermission: vi.fn(),
      sessionUpdate: vi.fn(),
      writeTextFile: vi.fn(),
      readTextFile: vi.fn(),
    } as unknown as Mocked<AgentSideConnection>;
    mockFallback = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    };
    vi.mocked(os.homedir).mockReturnValue('/home/user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readTextFile', () => {
    it.each([
      {
        capability: true,
        path: '/path/to/file',
        desc: 'connection if capability exists and file is inside root',
        setup: () => {
          mockConnection.readTextFile.mockResolvedValue({ content: 'content' });
        },
        verify: () => {
          expect(mockConnection.readTextFile).toHaveBeenCalledWith({
            path: '/path/to/file',
            sessionId: 'session-1',
          });
          expect(mockFallback.readTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: false,
        path: '/path/to/file',
        desc: 'fallback if capability missing',
        setup: () => {
          mockFallback.readTextFile.mockResolvedValue('content');
        },
        verify: () => {
          expect(mockFallback.readTextFile).toHaveBeenCalledWith(
            '/path/to/file',
          );
          expect(mockConnection.readTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: true,
        path: '/outside/file',
        desc: 'fallback if capability exists but file is outside root',
        setup: () => {
          mockFallback.readTextFile.mockResolvedValue('content');
        },
        verify: () => {
          expect(mockFallback.readTextFile).toHaveBeenCalledWith(
            '/outside/file',
          );
          expect(mockConnection.readTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: true,
        path: '/home/user/.gemini/tmp/file.md',
        root: '/home/user',
        desc: 'fallback if file is inside global gemini dir, even if root overlaps',
        setup: () => {
          mockFallback.readTextFile.mockResolvedValue('content');
        },
        verify: () => {
          expect(mockFallback.readTextFile).toHaveBeenCalledWith(
            '/home/user/.gemini/tmp/file.md',
          );
          expect(mockConnection.readTextFile).not.toHaveBeenCalled();
        },
      },
    ])(
      'should use $desc',
      async ({ capability, path, root, setup, verify }) => {
        service = new AcpFileSystemService(
          mockConnection,
          'session-1',
          { readTextFile: capability, writeTextFile: true },
          mockFallback,
          root || '/path/to',
        );
        setup();

        const result = await service.readTextFile(path);

        expect(result).toBe('content');
        verify();
      },
    );

    it('should throw normalized ENOENT error when readTextFile encounters "Resource not found"', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        '/path/to',
      );
      mockConnection.readTextFile.mockRejectedValue(
        new Error('Resource not found for document'),
      );

      await expect(
        service.readTextFile('/path/to/missing'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
        message: 'Resource not found for document',
      });
    });
  });

  describe('writeTextFile', () => {
    it.each([
      {
        capability: true,
        path: '/path/to/file',
        desc: 'connection if capability exists and file is inside root',
        verify: () => {
          expect(mockConnection.writeTextFile).toHaveBeenCalledWith({
            path: '/path/to/file',
            content: 'content',
            sessionId: 'session-1',
          });
          expect(mockFallback.writeTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: false,
        path: '/path/to/file',
        desc: 'fallback if capability missing',
        verify: () => {
          expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
            '/path/to/file',
            'content',
          );
          expect(mockConnection.writeTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: true,
        path: '/outside/file',
        desc: 'fallback if capability exists but file is outside root',
        verify: () => {
          expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
            '/outside/file',
            'content',
          );
          expect(mockConnection.writeTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: true,
        path: '/home/user/.gemini/tmp/file.md',
        root: '/home/user',
        desc: 'fallback if file is inside global gemini dir, even if root overlaps',
        verify: () => {
          expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
            '/home/user/.gemini/tmp/file.md',
            'content',
          );
          expect(mockConnection.writeTextFile).not.toHaveBeenCalled();
        },
      },
    ])('should use $desc', async ({ capability, path, root, verify }) => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { writeTextFile: capability, readTextFile: true },
        mockFallback,
        root || '/path/to',
      );

      await service.writeTextFile(path, 'content');

      verify();
    });

    it('should throw normalized ENOENT error when writeTextFile encounters "Resource not found"', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        '/path/to',
      );
      mockConnection.writeTextFile.mockRejectedValue(
        new Error('Resource not found for directory'),
      );

      await expect(
        service.writeTextFile('/path/to/missing', 'content'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
        message: 'Resource not found for directory',
      });
    });
  });

  describe('Windows path casing', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'process',
        Object.create(process, {
          platform: { get: () => 'win32' },
        }),
      );
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\user');
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should use ACP connection when in-root file path differs in drive/folder casing on Windows', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        'c:\\Users\\user\\project',
      );
      mockConnection.readTextFile.mockResolvedValue({ content: 'ide-content' });

      const readResult = await service.readTextFile(
        'C:\\Users\\user\\project\\src\\index.ts',
      );
      expect(readResult).toBe('ide-content');
      expect(mockConnection.readTextFile).toHaveBeenCalledWith({
        path: 'C:\\Users\\user\\project\\src\\index.ts',
        sessionId: 'session-1',
      });
      expect(mockFallback.readTextFile).not.toHaveBeenCalled();

      await service.writeTextFile(
        'C:\\USERS\\user\\project\\src\\index.ts',
        'updated',
      );
      expect(mockConnection.writeTextFile).toHaveBeenCalledWith({
        path: 'C:\\USERS\\user\\project\\src\\index.ts',
        content: 'updated',
        sessionId: 'session-1',
      });
      expect(mockFallback.writeTextFile).not.toHaveBeenCalled();
    });

    it('should use fallback for global .gemini files on Windows even when homedir casing differs', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        'c:\\Users\\user',
      );
      mockFallback.readTextFile.mockResolvedValue('native-settings');

      const result = await service.readTextFile(
        'c:\\Users\\user\\.gemini\\settings.json',
      );

      expect(result).toBe('native-settings');
      expect(mockFallback.readTextFile).toHaveBeenCalledWith(
        'c:\\Users\\user\\.gemini\\settings.json',
      );
      expect(mockConnection.readTextFile).not.toHaveBeenCalled();
    });
  });
});
