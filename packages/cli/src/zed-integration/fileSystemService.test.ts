/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { AcpFileSystemService } from './fileSystemService.js';
import type { AgentSideConnection } from '@agentclientprotocol/sdk';
import type { FileSystemService } from '@google/gemini-cli-core';

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
  });

  describe('readTextFile', () => {
    it.each([
      {
        capability: true,
        desc: 'connection if capability exists',
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
    ])('should use $desc', async ({ capability, setup, verify }) => {
      service = new AcpFileSystemService(
        mockConnection,
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
        desc: 'connection if capability exists',
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
        desc: 'fallback if capability missing',
        verify: () => {
          expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
            '/path/to/file',
            'content',
          );
          expect(mockConnection.writeTextFile).not.toHaveBeenCalled();
        },
      },
    ])('should use $desc', async ({ capability, verify }) => {
      service = new AcpFileSystemService(
        mockConnection,
        'session-1',
        { writeTextFile: capability, readTextFile: true },
        mockFallback,
      );

      await service.writeTextFile('/path/to/file', 'content');

      verify();
    });
  });
});
