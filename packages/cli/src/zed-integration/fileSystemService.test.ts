/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AcpFileSystemService } from './fileSystemService.js';
import type { FileSystemService } from '@google/gemini-cli-core';
import type * as acp from './acp.js';

describe('AcpFileSystemService', () => {
  let mockClient: acp.Client;
  let mockFallback: FileSystemService;
  let mockCapabilities: acp.FileSystemCapability;
  let service: AcpFileSystemService;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    mockClient = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    } as unknown as acp.Client;

    mockFallback = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      findFiles: vi.fn(),
    } as unknown as FileSystemService;

    mockCapabilities = {
      readTextFile: true,
      writeTextFile: true,
    } as acp.FileSystemCapability;

    service = new AcpFileSystemService(
      mockClient,
      sessionId,
      mockCapabilities,
      mockFallback,
    );
  });

  describe('constructor', () => {
    it('should create service with all dependencies', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AcpFileSystemService);
    });

    it('should accept session ID', () => {
      const customService = new AcpFileSystemService(
        mockClient,
        'custom-session',
        mockCapabilities,
        mockFallback,
      );

      expect(customService).toBeDefined();
    });

    it('should accept capabilities configuration', () => {
      const limitedCapabilities = {
        readTextFile: true,
        writeTextFile: false,
      } as acp.FileSystemCapability;

      const limitedService = new AcpFileSystemService(
        mockClient,
        sessionId,
        limitedCapabilities,
        mockFallback,
      );

      expect(limitedService).toBeDefined();
    });
  });

  describe('readTextFile', () => {
    it('should read file using ACP client when capability enabled', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'file contents',
      } as never);

      const result = await service.readTextFile('/path/to/file.txt');

      expect(result).toBe('file contents');
      expect(mockClient.readTextFile).toHaveBeenCalledWith({
        path: '/path/to/file.txt',
        sessionId: 'test-session-123',
        line: null,
        limit: null,
      });
    });

    it('should use fallback when capability disabled', async () => {
      mockCapabilities.readTextFile = false;
      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockFallback.readTextFile).mockResolvedValue(
        'fallback contents',
      );

      const result = await service.readTextFile('/path/to/file.txt');

      expect(result).toBe('fallback contents');
      expect(mockFallback.readTextFile).toHaveBeenCalledWith(
        '/path/to/file.txt',
      );
      expect(mockClient.readTextFile).not.toHaveBeenCalled();
    });

    it('should pass correct session ID', async () => {
      const customSession = 'custom-session-456';
      const customService = new AcpFileSystemService(
        mockClient,
        customSession,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'content',
      } as never);

      await customService.readTextFile('/file.txt');

      expect(mockClient.readTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'custom-session-456',
        }),
      );
    });

    it('should set line and limit to null', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'content',
      } as never);

      await service.readTextFile('/file.txt');

      expect(mockClient.readTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          line: null,
          limit: null,
        }),
      );
    });

    it('should handle empty file content', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: '',
      } as never);

      const result = await service.readTextFile('/empty.txt');

      expect(result).toBe('');
    });

    it('should handle multiline content', async () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: multiline,
      } as never);

      const result = await service.readTextFile('/multiline.txt');

      expect(result).toBe(multiline);
    });

    it('should handle different file paths', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'content',
      } as never);

      await service.readTextFile('/path/to/file1.txt');
      await service.readTextFile('/another/path/file2.ts');
      await service.readTextFile('./relative/path.js');

      expect(mockClient.readTextFile).toHaveBeenCalledTimes(3);
    });

    it('should propagate errors from ACP client', async () => {
      vi.mocked(mockClient.readTextFile).mockRejectedValue(
        new Error('File not found'),
      );

      await expect(service.readTextFile('/missing.txt')).rejects.toThrow(
        'File not found',
      );
    });

    it('should propagate errors from fallback', async () => {
      mockCapabilities.readTextFile = false;
      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockFallback.readTextFile).mockRejectedValue(
        new Error('Fallback error'),
      );

      await expect(service.readTextFile('/file.txt')).rejects.toThrow(
        'Fallback error',
      );
    });
  });

  describe('writeTextFile', () => {
    it('should write file using ACP client when capability enabled', async () => {
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.writeTextFile('/path/to/file.txt', 'new content');

      expect(mockClient.writeTextFile).toHaveBeenCalledWith({
        path: '/path/to/file.txt',
        content: 'new content',
        sessionId: 'test-session-123',
      });
    });

    it('should use fallback when capability disabled', async () => {
      mockCapabilities.writeTextFile = false;
      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockFallback.writeTextFile).mockResolvedValue(undefined);

      await service.writeTextFile('/path/to/file.txt', 'content');

      expect(mockFallback.writeTextFile).toHaveBeenCalledWith(
        '/path/to/file.txt',
        'content',
      );
      expect(mockClient.writeTextFile).not.toHaveBeenCalled();
    });

    it('should pass correct session ID', async () => {
      const customSession = 'write-session-789';
      const customService = new AcpFileSystemService(
        mockClient,
        customSession,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await customService.writeTextFile('/file.txt', 'content');

      expect(mockClient.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'write-session-789',
        }),
      );
    });

    it('should handle empty content', async () => {
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.writeTextFile('/file.txt', '');

      expect(mockClient.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '',
        }),
      );
    });

    it('should handle multiline content', async () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.writeTextFile('/file.txt', multiline);

      expect(mockClient.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: multiline,
        }),
      );
    });

    it('should handle different file paths', async () => {
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.writeTextFile('/path1.txt', 'content1');
      await service.writeTextFile('/path2.ts', 'content2');
      await service.writeTextFile('./relative.js', 'content3');

      expect(mockClient.writeTextFile).toHaveBeenCalledTimes(3);
    });

    it('should propagate errors from ACP client', async () => {
      vi.mocked(mockClient.writeTextFile).mockRejectedValue(
        new Error('Write failed'),
      );

      await expect(
        service.writeTextFile('/file.txt', 'content'),
      ).rejects.toThrow('Write failed');
    });

    it('should propagate errors from fallback', async () => {
      mockCapabilities.writeTextFile = false;
      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockFallback.writeTextFile).mockRejectedValue(
        new Error('Fallback write error'),
      );

      await expect(
        service.writeTextFile('/file.txt', 'content'),
      ).rejects.toThrow('Fallback write error');
    });

    it('should return void', async () => {
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      const result = await service.writeTextFile('/file.txt', 'content');

      expect(result).toBeUndefined();
    });
  });

  describe('findFiles', () => {
    it('should always use fallback implementation', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue([
        '/path/file1.txt',
        '/path/file2.txt',
      ]);

      const result = service.findFiles('*.txt', ['/path']);

      expect(result).toEqual(['/path/file1.txt', '/path/file2.txt']);
      expect(mockFallback.findFiles).toHaveBeenCalledWith('*.txt', ['/path']);
    });

    it('should pass fileName to fallback', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue([]);

      service.findFiles('test.ts', ['/src']);

      expect(mockFallback.findFiles).toHaveBeenCalledWith('test.ts', ['/src']);
    });

    it('should pass searchPaths to fallback', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue([]);

      service.findFiles('file.txt', ['/path1', '/path2', '/path3']);

      expect(mockFallback.findFiles).toHaveBeenCalledWith('file.txt', [
        '/path1',
        '/path2',
        '/path3',
      ]);
    });

    it('should return empty array when no files found', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue([]);

      const result = service.findFiles('nonexistent.txt', ['/path']);

      expect(result).toEqual([]);
    });

    it('should handle wildcard patterns', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue([
        '/src/file1.ts',
        '/src/file2.ts',
      ]);

      const result = service.findFiles('*.ts', ['/src']);

      expect(result).toHaveLength(2);
    });

    it('should not use ACP client even when capabilities enabled', () => {
      vi.mocked(mockFallback.findFiles).mockReturnValue(['/file.txt']);

      service.findFiles('file.txt', ['/path']);

      expect(mockFallback.findFiles).toHaveBeenCalled();
      // ACP client doesn't have findFiles method
    });
  });

  describe('capability-based behavior', () => {
    it('should use both ACP and fallback for different operations', async () => {
      mockCapabilities.readTextFile = true;
      mockCapabilities.writeTextFile = false;

      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'read via ACP',
      } as never);
      vi.mocked(mockFallback.writeTextFile).mockResolvedValue(undefined);

      await service.readTextFile('/file.txt');
      await service.writeTextFile('/file.txt', 'content');

      expect(mockClient.readTextFile).toHaveBeenCalled();
      expect(mockFallback.writeTextFile).toHaveBeenCalled();
    });

    it('should handle all capabilities disabled', async () => {
      mockCapabilities.readTextFile = false;
      mockCapabilities.writeTextFile = false;

      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockFallback.readTextFile).mockResolvedValue('content');
      vi.mocked(mockFallback.writeTextFile).mockResolvedValue(undefined);

      await service.readTextFile('/file.txt');
      await service.writeTextFile('/file.txt', 'content');

      expect(mockClient.readTextFile).not.toHaveBeenCalled();
      expect(mockClient.writeTextFile).not.toHaveBeenCalled();
      expect(mockFallback.readTextFile).toHaveBeenCalled();
      expect(mockFallback.writeTextFile).toHaveBeenCalled();
    });

    it('should handle all capabilities enabled', async () => {
      mockCapabilities.readTextFile = true;
      mockCapabilities.writeTextFile = true;

      service = new AcpFileSystemService(
        mockClient,
        sessionId,
        mockCapabilities,
        mockFallback,
      );

      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'content',
      } as never);
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.readTextFile('/file.txt');
      await service.writeTextFile('/file.txt', 'content');

      expect(mockClient.readTextFile).toHaveBeenCalled();
      expect(mockClient.writeTextFile).toHaveBeenCalled();
      expect(mockFallback.readTextFile).not.toHaveBeenCalled();
      expect(mockFallback.writeTextFile).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple sequential operations', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'original',
      } as never);
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);
      vi.mocked(mockFallback.findFiles).mockReturnValue(['/file.txt']);

      const content = await service.readTextFile('/file.txt');
      await service.writeTextFile('/file.txt', content + ' modified');
      const files = service.findFiles('*.txt', ['/']);

      expect(content).toBe('original');
      expect(mockClient.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'original modified',
        }),
      );
      expect(files).toHaveLength(1);
    });

    it('should maintain session ID across operations', async () => {
      vi.mocked(mockClient.readTextFile).mockResolvedValue({
        content: 'content',
      } as never);
      vi.mocked(mockClient.writeTextFile).mockResolvedValue(undefined as never);

      await service.readTextFile('/file1.txt');
      await service.writeTextFile('/file2.txt', 'content');

      expect(mockClient.readTextFile).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId }),
      );
      expect(mockClient.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId }),
      );
    });
  });
});
