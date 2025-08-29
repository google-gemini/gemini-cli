/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { PermissionRepository } from './PermissionRepository.js';

describe('PermissionRepository interface contract', () => {
  // Helper function to create a mock implementation for testing
  const createMockRepository = (): PermissionRepository => ({
    isAllowed: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    revokeAllForTool: vi.fn(),
    revokeAll: vi.fn(),
    getAllGranted: vi.fn(),
  });

  describe('interface contract verification', () => {
    it('should have all required methods', () => {
      const repo = createMockRepository();

      expect(typeof repo.isAllowed).toBe('function');
      expect(typeof repo.grant).toBe('function');
      expect(typeof repo.revoke).toBe('function');
      expect(typeof repo.revokeAllForTool).toBe('function');
      expect(typeof repo.revokeAll).toBe('function');
      expect(typeof repo.getAllGranted).toBe('function');
    });

    it('should return a boolean for isAllowed', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.isAllowed).mockResolvedValue(true);

      const result = await repo.isAllowed('test-tool', 'test-resource');

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    it('should return void for grant', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.grant).mockResolvedValue(undefined);

      const result = await repo.grant('test-tool', 'test-resource');

      expect(result).toBeUndefined();
    });

    it('should return void for revoke', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revoke).mockResolvedValue(undefined);

      const result = await repo.revoke('test-tool', 'test-resource');

      expect(result).toBeUndefined();
    });

    it('should return void for revokeAllForTool', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revokeAllForTool).mockResolvedValue(undefined);

      const result = await repo.revokeAllForTool('test-tool');

      expect(result).toBeUndefined();
    });

    it('should return void for revokeAll', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revokeAll).mockResolvedValue(undefined);

      const result = await repo.revokeAll();

      expect(result).toBeUndefined();
    });

    it('should return Map<string, Set<string>> for getAllGranted', async () => {
      const repo = createMockRepository();
      const mockMap = new Map([['tool1', new Set(['resource1', 'resource2'])]]);
      vi.mocked(repo.getAllGranted).mockResolvedValue(mockMap);

      const result = await repo.getAllGranted();

      expect(result instanceof Map).toBe(true);
      expect(result.get('tool1')).toEqual(new Set(['resource1', 'resource2']));
    });
  });

  describe('method call verification', () => {
    it('should call isAllowed with correct parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.isAllowed).mockResolvedValue(false);

      await repo.isAllowed('shell', '/path/to/file');

      expect(repo.isAllowed).toHaveBeenCalledWith('shell', '/path/to/file');
      expect(repo.isAllowed).toHaveBeenCalledTimes(1);
    });

    it('should call grant with correct parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.grant).mockResolvedValue(undefined);

      await repo.grant('memory', '/memory/path');

      expect(repo.grant).toHaveBeenCalledWith('memory', '/memory/path');
      expect(repo.grant).toHaveBeenCalledTimes(1);
    });

    it('should call revoke with correct parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revoke).mockResolvedValue(undefined);

      await repo.revoke('mcp', 'server.tool');

      expect(repo.revoke).toHaveBeenCalledWith('mcp', 'server.tool');
      expect(repo.revoke).toHaveBeenCalledTimes(1);
    });

    it('should call revokeAllForTool with correct parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revokeAllForTool).mockResolvedValue(undefined);

      await repo.revokeAllForTool('shell');

      expect(repo.revokeAllForTool).toHaveBeenCalledWith('shell');
      expect(repo.revokeAllForTool).toHaveBeenCalledTimes(1);
    });

    it('should call revokeAll with no parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.revokeAll).mockResolvedValue(undefined);

      await repo.revokeAll();

      expect(repo.revokeAll).toHaveBeenCalledWith();
      expect(repo.revokeAll).toHaveBeenCalledTimes(1);
    });

    it('should call getAllGranted with no parameters', async () => {
      const repo = createMockRepository();
      vi.mocked(repo.getAllGranted).mockResolvedValue(new Map());

      await repo.getAllGranted();

      expect(repo.getAllGranted).toHaveBeenCalledWith();
      expect(repo.getAllGranted).toHaveBeenCalledTimes(1);
    });
  });

  describe('async behavior', () => {
    it('should handle Promise rejection in isAllowed', async () => {
      const repo = createMockRepository();
      const error = new Error('Test error');
      vi.mocked(repo.isAllowed).mockRejectedValue(error);

      await expect(repo.isAllowed('test', 'test')).rejects.toThrow(
        'Test error',
      );
    });

    it('should handle Promise rejection in grant', async () => {
      const repo = createMockRepository();
      const error = new Error('Grant failed');
      vi.mocked(repo.grant).mockRejectedValue(error);

      await expect(repo.grant('test', 'test')).rejects.toThrow('Grant failed');
    });

    it('should handle Promise rejection in revoke', async () => {
      const repo = createMockRepository();
      const error = new Error('Revoke failed');
      vi.mocked(repo.revoke).mockRejectedValue(error);

      await expect(repo.revoke('test', 'test')).rejects.toThrow(
        'Revoke failed',
      );
    });

    it('should handle Promise rejection in revokeAllForTool', async () => {
      const repo = createMockRepository();
      const error = new Error('RevokeAllForTool failed');
      vi.mocked(repo.revokeAllForTool).mockRejectedValue(error);

      await expect(repo.revokeAllForTool('test')).rejects.toThrow(
        'RevokeAllForTool failed',
      );
    });

    it('should handle Promise rejection in revokeAll', async () => {
      const repo = createMockRepository();
      const error = new Error('RevokeAll failed');
      vi.mocked(repo.revokeAll).mockRejectedValue(error);

      await expect(repo.revokeAll()).rejects.toThrow('RevokeAll failed');
    });

    it('should handle Promise rejection in getAllGranted', async () => {
      const repo = createMockRepository();
      const error = new Error('GetAllGranted failed');
      vi.mocked(repo.getAllGranted).mockRejectedValue(error);

      await expect(repo.getAllGranted()).rejects.toThrow(
        'GetAllGranted failed',
      );
    });
  });

  describe('parameter validation expectations', () => {
    it('should expect string parameters for toolId in all methods', async () => {
      const repo = createMockRepository();

      // Setup mocks
      vi.mocked(repo.isAllowed).mockResolvedValue(true);
      vi.mocked(repo.grant).mockResolvedValue(undefined);
      vi.mocked(repo.revoke).mockResolvedValue(undefined);
      vi.mocked(repo.revokeAllForTool).mockResolvedValue(undefined);

      // Test with various string values
      const toolIds = ['shell', 'memory', 'mcp', ''];

      for (const toolId of toolIds) {
        await repo.isAllowed(toolId, 'resource');
        await repo.grant(toolId, 'resource');
        await repo.revoke(toolId, 'resource');
        await repo.revokeAllForTool(toolId);

        expect(repo.isAllowed).toHaveBeenCalledWith(toolId, 'resource');
        expect(repo.grant).toHaveBeenCalledWith(toolId, 'resource');
        expect(repo.revoke).toHaveBeenCalledWith(toolId, 'resource');
        expect(repo.revokeAllForTool).toHaveBeenCalledWith(toolId);
      }
    });

    it('should expect string parameters for resourceId in applicable methods', async () => {
      const repo = createMockRepository();

      // Setup mocks
      vi.mocked(repo.isAllowed).mockResolvedValue(true);
      vi.mocked(repo.grant).mockResolvedValue(undefined);
      vi.mocked(repo.revoke).mockResolvedValue(undefined);

      // Test with various string values
      const resourceIds = [
        '/path/to/file',
        'server.tool',
        '',
        'complex/path with spaces',
      ];

      for (const resourceId of resourceIds) {
        await repo.isAllowed('test', resourceId);
        await repo.grant('test', resourceId);
        await repo.revoke('test', resourceId);

        expect(repo.isAllowed).toHaveBeenCalledWith('test', resourceId);
        expect(repo.grant).toHaveBeenCalledWith('test', resourceId);
        expect(repo.revoke).toHaveBeenCalledWith('test', resourceId);
      }
    });
  });
});
