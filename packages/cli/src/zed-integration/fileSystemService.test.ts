/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { AcpFileSystemService } from './fileSystemService.js';
import type { Client } from './acp.js';
import type { FileSystemService } from '@google/gemini-cli-core';

describe('AcpFileSystemService', () => {
  let mockClient: Mocked<Client>;
  let mockFallback: Mocked<FileSystemService>;
  let service: AcpFileSystemService;

  beforeEach(() => {
    mockClient = {
      requestPermission: vi.fn(),
      sessionUpdate: vi.fn(),
      writeTextFile: vi.fn(),
      readTextFile: vi.fn(),
    };
    mockFallback = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      findFiles: vi.fn(),
    };
  });

  describe('readTextFile', () => {
    it.each([
      {
        capability: true,
        desc: 'client if capability exists',
        setup: () => {
          mockClient.readTextFile.mockResolvedValue({ content: 'content' });
        },
        verify: () => {
          expect(mockClient.readTextFile).toHaveBeenCalledWith({
            path: '/path/to/file',
            sessionId: 'session-1',
            line: null,
            limit: null,
          });
          expect(mockFallback.readTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: false,
        desc: 'fallback if capability missing',
        setup: () => {
          mockFallback.readTextFile.mockResolvedValue('content');
        },
        verify: () => {
          expect(mockFallback.readTextFile).toHaveBeenCalledWith(
            '/path/to/file',
          );
          expect(mockClient.readTextFile).not.toHaveBeenCalled();
        },
      },
    ])('should use $desc', async ({ capability, setup, verify }) => {
      service = new AcpFileSystemService(
        mockClient,
        'session-1',
        { readTextFile: capability, writeTextFile: true },
        mockFallback,
      );
      setup();

      const result = await service.readTextFile('/path/to/file');

      expect(result).toBe('content');
      verify();
    });
  });

  describe('writeTextFile', () => {
    it.each([
      {
        capability: true,
        desc: 'client if capability exists',
        verify: () => {
          expect(mockClient.writeTextFile).toHaveBeenCalledWith({
            path: '/path/to/file',
            content: 'content',
            sessionId: 'session-1',
          });
          expect(mockFallback.writeTextFile).not.toHaveBeenCalled();
        },
      },
      {
        capability: false,
        desc: 'fallback if capability missing',
        verify: () => {
          expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
            '/path/to/file',
            'content',
          );
          expect(mockClient.writeTextFile).not.toHaveBeenCalled();
        },
      },
    ])('should use $desc', async ({ capability, verify }) => {
      service = new AcpFileSystemService(
        mockClient,
        'session-1',
        { writeTextFile: capability, readTextFile: true },
        mockFallback,
      );

      await service.writeTextFile('/path/to/file', 'content');

      verify();
    });
  });

  it('should always use fallback for findFiles', () => {
    service = new AcpFileSystemService(
      mockClient,
      'session-1',
      { readTextFile: true, writeTextFile: true },
      mockFallback,
    );
    mockFallback.findFiles.mockReturnValue(['file1', 'file2']);

    const result = service.findFiles('pattern', ['/path']);

    expect(mockFallback.findFiles).toHaveBeenCalledWith('pattern', ['/path']);
    expect(result).toEqual(['file1', 'file2']);
  });
});
