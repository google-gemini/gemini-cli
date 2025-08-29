/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { ConfigPermissionRepository } from './ConfigPermissionRepository.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock filesystem operations
vi.mock('node:fs/promises');
vi.mock('node:os');

describe('ConfigPermissionRepository', () => {
  let repository: ConfigPermissionRepository;
  let mockHomedir: Mock;
  let mockReadFile: Mock;
  let mockWriteFile: Mock;
  let mockMkdir: Mock;

  const mockPermissionsPath = '/mock/home/.gemini/tool-permissions.json';

  beforeEach(() => {
    // Setup mocks
    mockHomedir = vi.mocked(os.homedir);
    mockReadFile = vi.mocked(fs.readFile);
    mockWriteFile = vi.mocked(fs.writeFile);
    mockMkdir = vi.mocked(fs.mkdir);

    // Default mock implementations
    mockHomedir.mockReturnValue('/mock/home');
    mockReadFile.mockResolvedValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    repository = new ConfigPermissionRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAllowed', () => {
    it('should return false when file does not exist', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(false);
      expect(mockReadFile).toHaveBeenCalledWith(mockPermissionsPath, 'utf-8');
    });

    it('should return false when permission does not exist', async () => {
      mockReadFile.mockResolvedValue('{"shell": []}');

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(false);
    });

    it('should return true when permission exists', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/path/to/file"]}');

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(true);
    });

    it('should return false when tool exists but resource not found', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/other/path"]}');

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(false);
    });

    it('should handle malformed JSON gracefully', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(false);
    });

    it('should handle filesystem errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await repository.isAllowed('shell', '/path/to/file');

      expect(result).toBe(false);
    });
  });

  describe('grant', () => {
    it('should grant permission and save to file', async () => {
      mockReadFile.mockResolvedValue('{}');

      await repository.grant('shell', '/path/to/file');

      expect(mockMkdir).toHaveBeenCalledWith(
        path.dirname(mockPermissionsPath),
        {
          recursive: true,
        },
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/path/to/file'] }, null, 2),
      );
    });

    it('should add to existing permissions', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/existing/path"]}');

      await repository.grant('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/existing/path', '/path/to/file'] }, null, 2),
      );
    });

    it('should not duplicate existing permissions', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/path/to/file"]}');

      await repository.grant('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/path/to/file'] }, null, 2),
      );
    });

    it('should handle multiple tools', async () => {
      mockReadFile.mockResolvedValue('{"memory": ["/memory/path"]}');

      await repository.grant('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify(
          { memory: ['/memory/path'], shell: ['/path/to/file'] },
          null,
          2,
        ),
      );
    });

    it('should create file when it does not exist', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      await repository.grant('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/path/to/file'] }, null, 2),
      );
    });

    it('should handle malformed JSON by recreating the file', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      await repository.grant('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/path/to/file'] }, null, 2),
      );
    });

    it('should propagate write errors', async () => {
      mockReadFile.mockResolvedValue('{}');
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      await expect(repository.grant('shell', '/path/to/file')).rejects.toThrow(
        'Disk full',
      );
    });
  });

  describe('revoke', () => {
    it('should revoke specific permission', async () => {
      mockReadFile.mockResolvedValue(
        '{"shell": ["/path/to/file", "/other/path"]}',
      );

      await repository.revoke('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/other/path'] }, null, 2),
      );
    });

    it('should remove empty tool arrays', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/path/to/file"]}');

      await repository.revoke('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });

    it('should handle non-existent file gracefully', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      await repository.revoke('shell', '/path/to/file');

      // Should not attempt to write since there's nothing to revoke
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle non-existent tool gracefully', async () => {
      mockReadFile.mockResolvedValue('{"memory": ["/memory/path"]}');

      await repository.revoke('shell', '/path/to/file');

      // Should not modify the file since the tool doesn't exist
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle non-existent permission gracefully', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/other/path"]}');

      await repository.revoke('shell', '/path/to/file');

      // Should save the file even though no changes were made (the permission didn't exist to delete)
      // This is the current implementation behavior - it saves if the tool exists
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: ['/other/path'] }, null, 2),
      );
    });

    it('should preserve other tools when revoking', async () => {
      mockReadFile.mockResolvedValue(
        '{"shell": ["/path/to/file"], "memory": ["/memory/path"]}',
      );

      await repository.revoke('shell', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ memory: ['/memory/path'] }, null, 2),
      );
    });
  });

  describe('revokeAllForTool', () => {
    it('should revoke all permissions for a specific tool', async () => {
      mockReadFile.mockResolvedValue(
        '{"shell": ["/path1", "/path2"], "memory": ["/memory/path"]}',
      );

      await repository.revokeAllForTool('shell');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ memory: ['/memory/path'] }, null, 2),
      );
    });

    it('should handle non-existent tool gracefully', async () => {
      mockReadFile.mockResolvedValue('{"memory": ["/memory/path"]}');

      await repository.revokeAllForTool('shell');

      // Implementation always saves, even if tool doesn't exist
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ memory: ['/memory/path'] }, null, 2),
      );
    });

    it('should handle non-existent file gracefully', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      await repository.revokeAllForTool('shell');

      // Implementation always saves, creating empty file
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });

    it('should create empty file when all tools are removed', async () => {
      mockReadFile.mockResolvedValue('{"shell": ["/path/to/file"]}');

      await repository.revokeAllForTool('shell');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });
  });

  describe('revokeAll', () => {
    it('should revoke all permissions for all tools', async () => {
      mockReadFile.mockResolvedValue(
        '{"shell": ["/path1"], "memory": ["/memory/path"]}',
      );

      await repository.revokeAll();

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });

    it('should handle non-existent file gracefully', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      await repository.revokeAll();

      // Implementation always saves, creating empty file
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });

    it('should handle empty permissions file', async () => {
      mockReadFile.mockResolvedValue('{}');

      await repository.revokeAll();

      // Implementation always saves, even if already empty
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({}, null, 2),
      );
    });
  });

  describe('getAllGranted', () => {
    it('should return all granted permissions as a Map', async () => {
      mockReadFile.mockResolvedValue(
        '{"shell": ["/path1", "/path2"], "memory": ["/memory/path"]}',
      );

      const result = await repository.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.get('shell')).toEqual(new Set(['/path1', '/path2']));
      expect(result.get('memory')).toEqual(new Set(['/memory/path']));
    });

    it('should return empty Map when file does not exist', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await repository.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });

    it('should return empty Map when file is empty', async () => {
      mockReadFile.mockResolvedValue('{}');

      const result = await repository.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });

    it('should handle malformed JSON gracefully', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      const result = await repository.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });

    it('should handle filesystem errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await repository.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle concurrent access gracefully', async () => {
      mockReadFile.mockResolvedValue('{"shell": []}');

      // Simulate concurrent grants
      const promises = [
        repository.grant('shell', '/path1'),
        repository.grant('shell', '/path2'),
        repository.grant('memory', '/memory/path'),
      ];

      await Promise.all(promises);

      // All grants should succeed (actual behavior depends on filesystem)
      expect(mockWriteFile).toHaveBeenCalledTimes(3);
    });

    it('should handle very long permission paths', async () => {
      mockReadFile.mockResolvedValue('{}');
      const longPath = '/very/long/path/' + 'a'.repeat(1000) + '/file';

      await repository.grant('shell', longPath);

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        expect.stringContaining(longPath),
      );
    });

    it('should handle special characters in paths', async () => {
      mockReadFile.mockResolvedValue('{}');
      const specialPath = '/path/with spaces/and-symbols_$@/file';

      await repository.grant('shell', specialPath);

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        expect.stringContaining(specialPath),
      );
    });

    it('should handle empty tool name gracefully', async () => {
      mockReadFile.mockResolvedValue('{}');

      await repository.grant('', '/path/to/file');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ '': ['/path/to/file'] }, null, 2),
      );
    });

    it('should handle empty resource name gracefully', async () => {
      mockReadFile.mockResolvedValue('{}');

      await repository.grant('shell', '');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockPermissionsPath,
        JSON.stringify({ shell: [''] }, null, 2),
      );
    });
  });

  describe('file path construction', () => {
    it('should use correct path construction with different home directories', () => {
      mockHomedir.mockReturnValue('/different/home');
      const newRepo = new ConfigPermissionRepository();

      // Trigger a read to see the path being used
      mockReadFile.mockResolvedValue('{}');
      newRepo.isAllowed('shell', '/test');

      expect(mockReadFile).toHaveBeenCalledWith(
        '/different/home/.gemini/tool-permissions.json',
        'utf-8',
      );
    });
  });
});
