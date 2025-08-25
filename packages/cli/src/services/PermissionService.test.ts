/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService } from './PermissionService.js';
import type { Config } from '@google/gemini-cli-core';
import {
  ApprovalMode,
  MemoryToolInvocation,
  DiscoveredMCPToolInvocation,
} from '@google/gemini-cli-core';

// Mock the console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  console.log = vi.fn();
  console.warn = vi.fn();
});

// Mock tool registry and tools
const mockShellTool = {
  getAllowedCommands: vi.fn(),
  clearAllPermissions: vi.fn(),
  revokeCommandPermission: vi.fn(),
};

const mockToolRegistry = {
  getToolByType: vi.fn(),
};

const mockConfig = {
  getToolRegistry: vi.fn(() => mockToolRegistry),
  getApprovalMode: vi.fn(),
  setApprovalMode: vi.fn(),
};

// Mock the static methods
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');

  const MockMemoryToolInvocation = {
    getAllowedMemoryPermissions: vi.fn(() => []),
    clearAllMemoryPermissions: vi.fn(),
    revokeMemoryPermission: vi.fn(),
  };

  const MockDiscoveredMCPToolInvocation = {
    getAllowedMcpPermissions: vi.fn(() => []),
    clearAllMcpPermissions: vi.fn(),
    revokeMcpPermission: vi.fn(),
  };

  return {
    ...actual,
    ApprovalMode: {
      DEFAULT: 'default',
      AUTO_EDIT: 'auto_edit',
    },
    ShellTool: vi.fn(),
    MemoryToolInvocation: MockMemoryToolInvocation,
    DiscoveredMCPToolInvocation: MockDiscoveredMCPToolInvocation,
  };
});

describe('PermissionService', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolRegistry.getToolByType.mockReturnValue(mockShellTool);
    mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);

    // Reset mock implementations
    mockShellTool.getAllowedCommands.mockReturnValue([]);
    vi.mocked(MemoryToolInvocation.getAllowedMemoryPermissions).mockReturnValue(
      [],
    );
    vi.mocked(
      DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
    ).mockReturnValue([]);

    permissionService = new PermissionService(mockConfig as unknown as Config);
  });

  describe('getAllPermissions', () => {
    it('should return empty array when no permissions are granted', () => {
      const permissions = permissionService.getAllPermissions();
      expect(permissions).toEqual([]);
    });

    it('should return shell permissions when they exist', () => {
      mockShellTool.getAllowedCommands.mockReturnValue(['ls', 'git status']);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual([
        {
          id: 'ls',
          type: 'shell',
          name: 'ls',
          description: 'Always allow shell command: ls',
        },
        {
          id: 'git status',
          type: 'shell',
          name: 'git status',
          description: 'Always allow shell command: git status',
        },
      ]);
    });

    it('should return MCP server permissions when they exist', () => {
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockReturnValue(['test-server', 'another-server']);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual(
        expect.arrayContaining([
          {
            id: 'test-server',
            type: 'mcp_server',
            name: 'test-server',
            description: 'Always allow all tools from MCP server "test-server"',
          },
          {
            id: 'another-server',
            type: 'mcp_server',
            name: 'another-server',
            description:
              'Always allow all tools from MCP server "another-server"',
          },
        ]),
      );
    });

    it('should return MCP tool-specific permissions when they exist', () => {
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockReturnValue(['server1.tool1', 'server2.tool2']);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual(
        expect.arrayContaining([
          {
            id: 'server1.tool1',
            type: 'mcp_tool',
            name: 'tool1 (server1)',
            description: 'Always allow MCP tool "tool1" from server "server1"',
          },
          {
            id: 'server2.tool2',
            type: 'mcp_tool',
            name: 'tool2 (server2)',
            description: 'Always allow MCP tool "tool2" from server "server2"',
          },
        ]),
      );
    });

    it('should return memory permissions when they exist', () => {
      vi.mocked(
        MemoryToolInvocation.getAllowedMemoryPermissions,
      ).mockReturnValue(['read-memory', 'write-memory']);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual(
        expect.arrayContaining([
          {
            id: 'read-memory',
            type: 'memory',
            name: 'read-memory',
            description: 'Always allow memory operation: read-memory',
          },
          {
            id: 'write-memory',
            type: 'memory',
            name: 'write-memory',
            description: 'Always allow memory operation: write-memory',
          },
        ]),
      );
    });

    it('should return global permissions when AUTO_EDIT mode is enabled', () => {
      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(1);
      expect(permissions).toEqual([
        {
          id: 'global_auto_edit',
          type: 'global',
          name: 'Auto-approve file edits',
          description:
            'Always allow file editing operations (edit, write-file, web-fetch)',
        },
      ]);
    });

    it('should handle shell tool not found gracefully', () => {
      mockToolRegistry.getToolByType.mockReturnValue(null);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toEqual([]);
      expect(console.log).toHaveBeenCalledWith(
        'DEBUG: Shell tool not found in registry',
      );
    });

    it('should handle errors when accessing shell permissions gracefully', () => {
      mockToolRegistry.getToolByType.mockImplementation(() => {
        throw new Error('Registry error');
      });

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        'Could not access shell permissions:',
        expect.any(Error),
      );
    });

    it('should handle errors when accessing MCP permissions gracefully', () => {
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockImplementation(() => {
        throw new Error('MCP error');
      });

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        'Could not access MCP permissions:',
        expect.any(Error),
      );
    });

    it('should handle errors when accessing memory permissions gracefully', () => {
      vi.mocked(
        MemoryToolInvocation.getAllowedMemoryPermissions,
      ).mockImplementation(() => {
        throw new Error('Memory error');
      });

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        'Could not access memory permissions:',
        expect.any(Error),
      );
    });
  });

  describe('resetPermissionsByType', () => {
    it('should reset shell permissions', () => {
      permissionService.resetPermissionsByType('shell');

      expect(mockShellTool.clearAllPermissions).toHaveBeenCalledTimes(1);
    });

    it('should reset MCP permissions', () => {
      permissionService.resetPermissionsByType('mcp');

      expect(
        DiscoveredMCPToolInvocation.clearAllMcpPermissions,
      ).toHaveBeenCalledTimes(1);
    });

    it('should reset memory permissions', () => {
      permissionService.resetPermissionsByType('memory');

      expect(
        MemoryToolInvocation.clearAllMemoryPermissions,
      ).toHaveBeenCalledTimes(1);
    });

    it('should reset global permissions', () => {
      permissionService.resetPermissionsByType('global');

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
    });

    it('should throw error for unknown permission type', () => {
      expect(() => {
        permissionService.resetPermissionsByType('unknown');
      }).toThrow('Unknown permission type: unknown');
    });

    it('should handle errors when resetting shell permissions gracefully', () => {
      mockShellTool.clearAllPermissions.mockImplementation(() => {
        throw new Error('Reset error');
      });

      expect(() => {
        permissionService.resetPermissionsByType('shell');
      }).not.toThrow();

      expect(console.warn).toHaveBeenCalledWith(
        'Could not reset shell permissions:',
        expect.any(Error),
      );
    });
  });

  describe('resetPermission', () => {
    beforeEach(() => {
      // Set up some permissions to reset
      mockShellTool.getAllowedCommands.mockReturnValue(['ls']);
      vi.mocked(
        MemoryToolInvocation.getAllowedMemoryPermissions,
      ).mockReturnValue(['read-memory']);
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockReturnValue(['server1', 'server2.tool1']);
    });

    it('should reset individual shell permission', () => {
      permissionService.resetPermission('ls');

      expect(mockShellTool.revokeCommandPermission).toHaveBeenCalledWith('ls');
    });

    it('should reset individual memory permission', () => {
      permissionService.resetPermission('read-memory');

      expect(MemoryToolInvocation.revokeMemoryPermission).toHaveBeenCalledWith(
        'read-memory',
      );
    });

    it('should reset individual MCP server permission', () => {
      permissionService.resetPermission('server1');

      expect(
        DiscoveredMCPToolInvocation.revokeMcpPermission,
      ).toHaveBeenCalledWith('server1');
    });

    it('should reset individual MCP tool permission', () => {
      permissionService.resetPermission('server2.tool1');

      expect(
        DiscoveredMCPToolInvocation.revokeMcpPermission,
      ).toHaveBeenCalledWith('server2.tool1');
    });

    it('should reset global permissions when resetting global permission', () => {
      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);

      permissionService.resetPermission('global_auto_edit');

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
    });

    it('should throw error for non-existent permission', () => {
      expect(() => {
        permissionService.resetPermission('non-existent');
      }).toThrow('Permission not found: non-existent');
    });

    it('should handle errors when resetting individual permissions gracefully', () => {
      mockShellTool.revokeCommandPermission.mockImplementation(() => {
        throw new Error('Revoke error');
      });

      expect(() => {
        permissionService.resetPermission('ls');
      }).not.toThrow();

      expect(console.warn).toHaveBeenCalledWith(
        'Could not reset shell permission:',
        expect.any(Error),
      );
    });

    it('should throw error for permission with unknown type', () => {
      // Mock getAllPermissions to return a permission with unknown type
      const originalGetAllPermissions = permissionService.getAllPermissions;
      permissionService.getAllPermissions = vi.fn().mockReturnValue([
        {
          id: 'unknown-perm',
          type: 'unknown',
          name: 'Unknown Permission',
          description: 'Test permission with unknown type',
        },
      ]);

      expect(() => {
        permissionService.resetPermission('unknown-perm');
      }).toThrow('Unknown permission type: unknown');

      // Restore original method
      permissionService.getAllPermissions = originalGetAllPermissions;
    });
  });

  describe('resetAllPermissions', () => {
    it('should reset all permission types', () => {
      permissionService.resetAllPermissions();

      expect(mockShellTool.clearAllPermissions).toHaveBeenCalledTimes(1);
      expect(
        DiscoveredMCPToolInvocation.clearAllMcpPermissions,
      ).toHaveBeenCalledTimes(1);
      expect(
        MemoryToolInvocation.clearAllMemoryPermissions,
      ).toHaveBeenCalledTimes(1);
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
    });

    it('should continue resetting other types even if one fails', () => {
      mockShellTool.clearAllPermissions.mockImplementation(() => {
        throw new Error('Shell reset failed');
      });

      permissionService.resetAllPermissions();

      expect(
        DiscoveredMCPToolInvocation.clearAllMcpPermissions,
      ).toHaveBeenCalledTimes(1);
      expect(
        MemoryToolInvocation.clearAllMemoryPermissions,
      ).toHaveBeenCalledTimes(1);
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.DEFAULT,
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Could not reset shell permissions:',
        expect.any(Error),
      );
    });
  });

  describe('integration scenarios', () => {
    it('should return all permission types when all are present', () => {
      // Set up permissions for all types
      mockShellTool.getAllowedCommands.mockReturnValue(['ls', 'pwd']);
      vi.mocked(
        MemoryToolInvocation.getAllowedMemoryPermissions,
      ).mockReturnValue(['read']);
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockReturnValue(['server1', 'server2.tool1']);
      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);

      const permissions = permissionService.getAllPermissions();

      expect(permissions).toHaveLength(6); // 2 shell + 1 memory + 2 mcp + 1 global
      expect(permissions.map((p) => p.type)).toEqual(
        expect.arrayContaining([
          'shell',
          'memory',
          'mcp_server',
          'mcp_tool',
          'global',
        ]),
      );
    });

    it('should handle mixed MCP server and tool permissions correctly', () => {
      vi.mocked(
        DiscoveredMCPToolInvocation.getAllowedMcpPermissions,
      ).mockReturnValue([
        'server1',
        'server1.tool1',
        'server2.tool2',
        'server2.tool3',
      ]);

      const permissions = permissionService.getAllPermissions();

      const mcpPermissions = permissions.filter((p) =>
        p.type.startsWith('mcp_'),
      );
      expect(mcpPermissions).toHaveLength(4);

      const serverPermissions = mcpPermissions.filter(
        (p) => p.type === 'mcp_server',
      );
      const toolPermissions = mcpPermissions.filter(
        (p) => p.type === 'mcp_tool',
      );

      expect(serverPermissions).toHaveLength(1);
      expect(toolPermissions).toHaveLength(3);

      expect(serverPermissions[0]).toEqual({
        id: 'server1',
        type: 'mcp_server',
        name: 'server1',
        description: 'Always allow all tools from MCP server "server1"',
      });

      expect(toolPermissions).toEqual(
        expect.arrayContaining([
          {
            id: 'server1.tool1',
            type: 'mcp_tool',
            name: 'tool1 (server1)',
            description: 'Always allow MCP tool "tool1" from server "server1"',
          },
          {
            id: 'server2.tool2',
            type: 'mcp_tool',
            name: 'tool2 (server2)',
            description: 'Always allow MCP tool "tool2" from server "server2"',
          },
          {
            id: 'server2.tool3',
            type: 'mcp_tool',
            name: 'tool3 (server2)',
            description: 'Always allow MCP tool "tool3" from server "server2"',
          },
        ]),
      );
    });
  });
});

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});
