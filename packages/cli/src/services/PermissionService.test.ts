/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService } from './PermissionService.js';
import type { Config, PermissionRepository } from '@google/gemini-cli-core';
import { ApprovalMode } from '@google/gemini-cli-core';

describe('PermissionService', () => {
  let permissionService: PermissionService;
  let mockConfig: Config;
  let mockPermissionRepo: PermissionRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock permission repository with some test data
    const permissions = new Map([
      ['shell', new Set(['git status', 'npm install'])],
      ['mcp', new Set(['server1.tool1', 'server2'])],
      ['memory', new Set(['/path/to/memory.md'])],
    ]);

    mockPermissionRepo = {
      isAllowed: vi
        .fn()
        .mockImplementation(
          async (toolId: string, permissionKey: string) =>
            permissions.get(toolId)?.has(permissionKey) ?? false,
        ),
      grant: vi
        .fn()
        .mockImplementation(async (toolId: string, permissionKey: string) => {
          if (!permissions.has(toolId)) {
            permissions.set(toolId, new Set());
          }
          permissions.get(toolId)!.add(permissionKey);
        }),
      revoke: vi
        .fn()
        .mockImplementation(async (toolId: string, permissionKey: string) => {
          permissions.get(toolId)?.delete(permissionKey);
        }),
      revokeAllForTool: vi.fn().mockImplementation(async (toolId: string) => {
        permissions.delete(toolId);
      }),
      revokeAll: vi.fn().mockImplementation(async () => {
        permissions.clear();
      }),
      getAllGranted: vi
        .fn()
        .mockImplementation(async () => new Map(permissions)),
    };

    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      setApprovalMode: vi.fn(),
    } as unknown as Config;

    permissionService = new PermissionService(mockConfig, mockPermissionRepo);
  });

  describe('getAllPermissions', () => {
    it('should return all permissions from repository with proper formatting', async () => {
      const permissions = await permissionService.getAllPermissions();

      expect(permissions).toHaveLength(5); // 2 shell + 2 mcp + 1 memory (no global with DEFAULT approval mode)

      // Check shell permissions
      const shellPermissions = permissions.filter((p) => p.type === 'shell');
      expect(shellPermissions).toHaveLength(2);
      expect(shellPermissions.map((p) => p.name)).toContain('git status');
      expect(shellPermissions.map((p) => p.name)).toContain('npm install');

      // Check MCP permissions
      const mcpPermissions = permissions.filter((p) =>
        p.type.startsWith('mcp_'),
      );
      expect(mcpPermissions).toHaveLength(2);

      // Check memory permissions
      const memoryPermissions = permissions.filter((p) => p.type === 'memory');
      expect(memoryPermissions).toHaveLength(1);
    });

    it('should include global permissions when approval mode is AUTO_EDIT', async () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(
        ApprovalMode.AUTO_EDIT,
      );

      const permissions = await permissionService.getAllPermissions();
      const globalPermissions = permissions.filter((p) => p.type === 'global');

      expect(globalPermissions).toHaveLength(1);
      expect(globalPermissions[0].name).toBe('Auto-approve file edits');
    });
  });

  describe('resetPermissionsByType', () => {
    it('should reset shell permissions', async () => {
      await permissionService.resetPermissionsByType('shell');

      expect(mockPermissionRepo.revokeAllForTool).toHaveBeenCalledWith('shell');
    });

    it('should reset MCP permissions', async () => {
      await permissionService.resetPermissionsByType('mcp');

      expect(mockPermissionRepo.revokeAllForTool).toHaveBeenCalledWith('mcp');
    });

    it('should reset memory permissions', async () => {
      await permissionService.resetPermissionsByType('memory');

      expect(mockPermissionRepo.revokeAllForTool).toHaveBeenCalledWith(
        'memory',
      );
    });

    it('should reset global permissions', async () => {
      await permissionService.resetPermissionsByType('global');

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
    });

    it('should throw error for unknown permission type', async () => {
      await expect(
        permissionService.resetPermissionsByType('unknown'),
      ).rejects.toThrow('Unknown permission type: unknown');
    });
  });

  describe('resetPermission', () => {
    it('should reset individual shell permission', async () => {
      await permissionService.resetPermission('shell.git status');

      expect(mockPermissionRepo.revoke).toHaveBeenCalledWith(
        'shell',
        'git status',
      );
    });

    it('should reset individual MCP permission', async () => {
      await permissionService.resetPermission('mcp.server1.tool1');

      expect(mockPermissionRepo.revoke).toHaveBeenCalledWith(
        'mcp',
        'server1.tool1',
      );
    });

    it('should reset individual memory permission', async () => {
      await permissionService.resetPermission('memory./path/to/memory.md');

      expect(mockPermissionRepo.revoke).toHaveBeenCalledWith(
        'memory',
        '/path/to/memory.md',
      );
    });

    it('should throw error for non-existent permission', async () => {
      await expect(
        permissionService.resetPermission('nonexistent.permission'),
      ).rejects.toThrow('Permission not found: nonexistent.permission');
    });
  });

  describe('resetAllPermissions', () => {
    it('should reset all permissions in repository and global settings', async () => {
      await permissionService.resetAllPermissions();

      expect(mockPermissionRepo.revokeAll).toHaveBeenCalled();
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
    });
  });
});
