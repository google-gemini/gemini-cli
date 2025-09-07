/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Central repository interface for managing tool permissions.
 * This interface abstracts permission storage and management from individual tools.
 */
export interface PermissionRepository {
  /**
   * Check if a specific permission is granted for a tool.
   * @param toolId - Unique identifier for the tool (e.g., 'shell', 'mcp', 'memory')
   * @param permissionKey - Specific permission key (e.g., 'git status', 'server.tool')
   * @returns Promise resolving to true if permission is granted
   */
  isAllowed(toolId: string, permissionKey: string): Promise<boolean>;

  /**
   * Grant a specific permission for a tool.
   * @param toolId - Unique identifier for the tool
   * @param permissionKey - Specific permission key to grant
   */
  grant(toolId: string, permissionKey: string): Promise<void>;

  /**
   * Revoke a specific permission for a tool.
   * @param toolId - Unique identifier for the tool
   * @param permissionKey - Specific permission key to revoke
   */
  revoke(toolId: string, permissionKey: string): Promise<void>;

  /**
   * Revoke all permissions for a specific tool.
   * @param toolId - Unique identifier for the tool
   */
  revokeAllForTool(toolId: string): Promise<void>;

  /**
   * Revoke all permissions across all tools.
   */
  revokeAll(): Promise<void>;

  /**
   * Get all currently granted permissions.
   * @returns Promise resolving to a map of toolId -> Set of permission keys
   */
  getAllGranted(): Promise<Map<string, Set<string>>>;
}