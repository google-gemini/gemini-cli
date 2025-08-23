/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, ApprovalMode, ShellTool, MemoryToolInvocation, DiscoveredMCPToolInvocation } from '@google/gemini-cli-core';

export interface ToolPermission {
  id: string;
  type: 'shell' | 'mcp_server' | 'mcp_tool' | 'memory' | 'global';
  name: string;
  description: string;
}

export class PermissionService {
  constructor(private config: Config) {}

  /**
   * Gets all currently granted "Always Allow" permissions across all tools
   */
  getAllPermissions(): ToolPermission[] {
    const permissions: ToolPermission[] = [];

    // Shell permissions
    const shellPermissions = this.getShellPermissions();
    permissions.push(...shellPermissions);

    // MCP permissions
    const mcpPermissions = this.getMcpPermissions();
    permissions.push(...mcpPermissions);

    // Memory permissions
    const memoryPermissions = this.getMemoryPermissions();
    permissions.push(...memoryPermissions);

    // Global approval mode permissions
    const globalPermissions = this.getGlobalPermissions();
    permissions.push(...globalPermissions);

    return permissions;
  }

  /**
   * Reset all permissions for a specific tool type
   */
  resetPermissionsByType(type: string): void {
    switch (type) {
      case 'shell':
        this.resetShellPermissions();
        break;
      case 'mcp':
        this.resetMcpPermissions();
        break;
      case 'memory':
        this.resetMemoryPermissions();
        break;
      case 'global':
        this.resetGlobalPermissions();
        break;
      default:
        throw new Error(`Unknown permission type: ${type}`);
    }
  }

  /**
   * Reset a specific permission by ID
   */
  resetPermission(permissionId: string): void {
    const permission = this.getAllPermissions().find(
      (p) => p.id === permissionId,
    );
    if (!permission) {
      throw new Error(`Permission not found: ${permissionId}`);
    }

    switch (permission.type) {
      case 'shell':
        this.resetShellPermission(permissionId);
        break;
      case 'mcp_server':
      case 'mcp_tool':
        this.resetMcpPermission(permissionId);
        break;
      case 'memory':
        this.resetMemoryPermission(permissionId);
        break;
      case 'global':
        this.resetGlobalPermissions();
        break;
    }
  }

  /**
   * Reset all permissions across all tools
   */
  resetAllPermissions(): void {
    this.resetShellPermissions();
    this.resetMcpPermissions();
    this.resetMemoryPermissions();
    this.resetGlobalPermissions();
  }

  private getShellPermissions(): ToolPermission[] {
    const permissions: ToolPermission[] = [];

    try {
      const registry = this.config.getToolRegistry();
      const shellTool = registry.getToolByType(ShellTool);

      if (shellTool) {
        const allowedCommands = shellTool.getAllowedCommands();
        console.log(
          'DEBUG: Shell tool found, allowed commands:',
          allowedCommands,
        );

        for (const command of allowedCommands) {
          permissions.push({
            id: command,
            type: 'shell',
            name: command,
            description: `Always allow shell command: ${command}`,
          });
        }
      } else {
        console.log('DEBUG: Shell tool not found in registry');
      }
    } catch (error) {
      console.warn('Could not access shell permissions:', error);
    }

    console.log('DEBUG: Returning shell permissions:', permissions);
    return permissions;
  }

  private getMcpPermissions(): ToolPermission[] {
    const permissions: ToolPermission[] = [];

    try {
      const allowedPermissions = DiscoveredMCPToolInvocation.getAllowedMcpPermissions();

      for (const allowlistKey of allowedPermissions) {
        if (allowlistKey.includes('.')) {
          // Tool-specific permission
          const [serverName, toolName] = allowlistKey.split('.');
          permissions.push({
            id: allowlistKey,
            type: 'mcp_tool',
            name: `${toolName} (${serverName})`,
            description: `Always allow MCP tool "${toolName}" from server "${serverName}"`,
          });
        } else {
          // Server-wide permission
          permissions.push({
            id: allowlistKey,
            type: 'mcp_server',
            name: allowlistKey,
            description: `Always allow all tools from MCP server "${allowlistKey}"`,
          });
        }
      }
    } catch (error) {
      console.warn('Could not access MCP permissions:', error);
    }

    return permissions;
  }

  private getMemoryPermissions(): ToolPermission[] {
    const permissions: ToolPermission[] = [];

    try {
      const allowedPermissions = MemoryToolInvocation.getAllowedMemoryPermissions();

      for (const allowlistKey of allowedPermissions) {
        permissions.push({
          id: allowlistKey,
          type: 'memory',
          name: allowlistKey,
          description: `Always allow memory operation: ${allowlistKey}`,
        });
      }
    } catch (error) {
      console.warn('Could not access memory permissions:', error);
    }

    return permissions;
  }

  private getGlobalPermissions(): ToolPermission[] {
    const permissions: ToolPermission[] = [];

    const approvalMode = this.config.getApprovalMode();
    if (approvalMode === ApprovalMode.AUTO_EDIT) {
      permissions.push({
        id: 'global_auto_edit',
        type: 'global',
        name: 'Auto-approve file edits',
        description:
          'Always allow file editing operations (edit, write-file, web-fetch)',
      });
    }

    return permissions;
  }

  private resetShellPermissions(): void {
    try {
      const registry = this.config.getToolRegistry();
      const shellTool = registry.getToolByType(ShellTool);

      if (shellTool) {
        shellTool.clearAllPermissions();
      }
    } catch (error) {
      console.warn('Could not reset shell permissions:', error);
    }
  }

  private resetShellPermission(permissionId: string): void {
    try {
      const registry = this.config.getToolRegistry();
      const shellTool = registry.getToolByType(ShellTool);

      if (shellTool) {
        shellTool.revokeCommandPermission(permissionId);
      }
    } catch (error) {
      console.warn('Could not reset shell permission:', error);
    }
  }

  private resetMcpPermissions(): void {
    try {
      DiscoveredMCPToolInvocation.clearAllMcpPermissions();
    } catch (error) {
      console.warn('Could not reset MCP permissions:', error);
    }
  }

  private resetMcpPermission(permissionId: string): void {
    try {
      DiscoveredMCPToolInvocation.revokeMcpPermission(permissionId);
    } catch (error) {
      console.warn('Could not reset MCP permission:', error);
    }
  }

  private resetMemoryPermissions(): void {
    try {
      MemoryToolInvocation.clearAllMemoryPermissions();
    } catch (error) {
      console.warn('Could not reset memory permissions:', error);
    }
  }

  private resetMemoryPermission(permissionId: string): void {
    try {
      MemoryToolInvocation.revokeMemoryPermission(permissionId);
    } catch (error) {
      console.warn('Could not reset memory permission:', error);
    }
  }

  private resetGlobalPermissions(): void {
    this.config.setApprovalMode(ApprovalMode.DEFAULT);
  }
}
