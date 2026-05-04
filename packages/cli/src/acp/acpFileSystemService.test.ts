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

    it.each([
      {
        name: 'snake_case "not_found"',
        message: 'fs/read_text_file not_found: missing path',
      },
      {
        name: 'phrase "file not found"',
        message: 'agent: file not found at /tmp/x',
      },
    ])(
      'should throw normalized ENOENT for $name message variants',
      async ({ message }) => {
        service = new AcpFileSystemService(
          mockConnection,
          'session-1',
          { readTextFile: true, writeTextFile: true },
          mockFallback,
          '/path/to',
        );
        mockConnection.readTextFile.mockRejectedValue(new Error(message));

        await expect(
          service.readTextFile('/path/to/missing'),
        ).rejects.toMatchObject({
          code: 'ENOENT',
          message,
        });
      },
    );

    it('should throw normalized ENOENT when the ACP error carries a structured `code: "ENOENT"` field', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        '/path/to',
      );
      const structured = Object.assign(new Error('opaque server message'), {
        code: 'ENOENT',
      });
      mockConnection.readTextFile.mockRejectedValue(structured);

      await expect(
        service.readTextFile('/path/to/missing'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
        message: 'opaque server message',
      });
    });

    it('should preserve the message when a structured ENOENT error is a plain (non-Error) object', async () => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { readTextFile: true, writeTextFile: true },
        mockFallback,
        '/path/to',
      );
      // JSON-RPC clients often surface error responses as plain objects
      // (not Error instances). The `message` field must still be preserved
      // — without explicit handling, `String({})` collapses to
      // '[object Object]' and the real diagnostic is lost.
      mockConnection.readTextFile.mockRejectedValue({
        code: 'ENOENT',
        message: 'plain object error message',
      });

      await expect(
        service.readTextFile('/path/to/missing'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
        message: 'plain object error message',
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
});
