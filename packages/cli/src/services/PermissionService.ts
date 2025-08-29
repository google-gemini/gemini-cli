/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, PermissionRepository } from '@google/gemini-cli-core';
import { ApprovalMode } from '@google/gemini-cli-core';

export interface ToolPermission {
  id: string;
  type: 'shell' | 'mcp_server' | 'mcp_tool' | 'memory' | 'global';
  name: string;
  description: string;
}

export class PermissionService {
  constructor(
    private config: Config,
    private permissionRepo: PermissionRepository,
  ) {}

  /**
   * Gets all currently granted "Always Allow" permissions across all tools
   */
  async getAllPermissions(): Promise<ToolPermission[]> {
    const permissions: ToolPermission[] = [];
    const allGranted = await this.permissionRepo.getAllGranted();

    for (const [toolId, permissionKeys] of allGranted) {
      for (const permissionKey of permissionKeys) {
        permissions.push({
          id: `${toolId}.${permissionKey}`,
          type: this.mapToolIdToType(toolId),
          name: permissionKey,
          description: this.formatDescription(toolId, permissionKey),
        });
      }
    }

    // Global approval mode permissions
    const globalPermissions = this.getGlobalPermissions();
    permissions.push(...globalPermissions);

    return permissions;
  }

  /**
   * Reset all permissions for a specific tool type
   */
  async resetPermissionsByType(type: string): Promise<void> {
    switch (type) {
      case 'shell':
        await this.permissionRepo.revokeAllForTool('shell');
        break;
      case 'mcp':
        await this.permissionRepo.revokeAllForTool('mcp');
        break;
      case 'memory':
        await this.permissionRepo.revokeAllForTool('memory');
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
  async resetPermission(permissionId: string): Promise<void> {
    const permissions = await this.getAllPermissions();
    const permission = permissions.find((p) => p.id === permissionId);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionId}`);
    }

    // Extract tool ID and permission key from the ID
    const parts = permissionId.split('.');
    const toolId = parts[0];
    const permissionKey = parts.slice(1).join('.');

    switch (permission.type) {
      case 'shell':
      case 'mcp_server':
      case 'mcp_tool':
      case 'memory':
        await this.permissionRepo.revoke(toolId, permissionKey);
        break;
      case 'global':
        this.resetGlobalPermissions();
        break;
      default:
        throw new Error(`Unknown permission type: ${permission.type}`);
    }
  }

  /**
   * Reset all permissions across all tools
   */
  async resetAllPermissions(): Promise<void> {
    await this.permissionRepo.revokeAll();
    this.resetGlobalPermissions();
  }

  /**
   * Maps tool ID to permission type for UI display
   */
  private mapToolIdToType(
    toolId: string,
  ): 'shell' | 'mcp_server' | 'mcp_tool' | 'memory' {
    switch (toolId) {
      case 'shell':
        return 'shell';
      case 'mcp':
        return 'mcp_tool'; // Default to tool-level for MCP
      case 'memory':
        return 'memory';
      default:
        return 'mcp_tool'; // Default fallback
    }
  }

  /**
   * Formats a human-readable description for a permission
   */
  private formatDescription(toolId: string, permissionKey: string): string {
    switch (toolId) {
      case 'shell':
        return `Always allow shell command: ${permissionKey}`;
      case 'mcp':
        if (permissionKey.includes('.')) {
          const [serverName, toolName] = permissionKey.split('.');
          return `Always allow MCP tool "${toolName}" from server "${serverName}"`;
        } else {
          return `Always allow all tools from MCP server "${permissionKey}"`;
        }
      case 'memory':
        return `Always allow memory operation: ${permissionKey}`;
      default:
        return `Always allow: ${permissionKey}`;
    }
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

  private resetGlobalPermissions(): void {
    this.config.setApprovalMode(ApprovalMode.DEFAULT);
  }
}
