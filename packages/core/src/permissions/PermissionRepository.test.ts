/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PermissionRepository } from './PermissionRepository.js';

// Mock implementation for testing the interface contract
class MockPermissionRepository implements PermissionRepository {
  private permissions = new Map<string, Set<string>>();

  async isAllowed(toolId: string, permissionKey: string): Promise<boolean> {
    return this.permissions.get(toolId)?.has(permissionKey) ?? false;
  }

  async grant(toolId: string, permissionKey: string): Promise<void> {
    if (!this.permissions.has(toolId)) {
      this.permissions.set(toolId, new Set());
    }
    this.permissions.get(toolId)!.add(permissionKey);
  }

  async revoke(toolId: string, permissionKey: string): Promise<void> {
    const toolPermissions = this.permissions.get(toolId);
    if (toolPermissions) {
      toolPermissions.delete(permissionKey);
      if (toolPermissions.size === 0) {
        this.permissions.delete(toolId);
      }
    }
  }

  async revokeAllForTool(toolId: string): Promise<void> {
    this.permissions.delete(toolId);
  }

  async revokeAll(): Promise<void> {
    this.permissions.clear();
  }

  async getAllGranted(): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    this.permissions.forEach((permissions, toolId) => {
      result.set(toolId, new Set(permissions));
    });
    return result;
  }
}

describe('PermissionRepository Interface', () => {
  let repo: PermissionRepository;

  beforeEach(() => {
    repo = new MockPermissionRepository();
  });

  describe('grant and isAllowed', () => {
    it('should grant and check permissions correctly', async () => {
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      
      await repo.grant('shell', 'git status');
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
    });

    it('should handle multiple permissions for same tool', async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(true);
      expect(await repo.isAllowed('shell', 'rm -rf')).toBe(false);
    });

    it('should handle multiple tools', async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('memory', 'read_context');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
      expect(await repo.isAllowed('shell', 'read_context')).toBe(false);
      expect(await repo.isAllowed('memory', 'git status')).toBe(false);
    });
  });

  describe('revoke', () => {
    beforeEach(async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      await repo.grant('memory', 'read_context');
    });

    it('should revoke specific permissions', async () => {
      await repo.revoke('shell', 'git status');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(true);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
    });

    it('should handle revoking non-existent permissions', async () => {
      await repo.revoke('shell', 'non-existent');
      await repo.revoke('non-existent-tool', 'any-permission');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(true);
    });
  });

  describe('revokeAllForTool', () => {
    beforeEach(async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      await repo.grant('memory', 'read_context');
    });

    it('should revoke all permissions for a tool', async () => {
      await repo.revokeAllForTool('shell');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(false);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
    });

    it('should handle revoking from non-existent tool', async () => {
      await repo.revokeAllForTool('non-existent');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
    });
  });

  describe('revokeAll', () => {
    beforeEach(async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      await repo.grant('memory', 'read_context');
    });

    it('should revoke all permissions for all tools', async () => {
      await repo.revokeAll();
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(false);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(false);
    });
  });

  describe('getAllGranted', () => {
    it('should return empty map when no permissions granted', async () => {
      const permissions = await repo.getAllGranted();
      expect(permissions.size).toBe(0);
    });

    it('should return all granted permissions', async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      await repo.grant('memory', 'read_context');
      
      const permissions = await repo.getAllGranted();
      
      expect(permissions.size).toBe(2);
      expect(permissions.get('shell')).toEqual(new Set(['git status', 'npm install']));
      expect(permissions.get('memory')).toEqual(new Set(['read_context']));
    });

    it('should return a copy to prevent external mutation', async () => {
      await repo.grant('shell', 'git status');
      
      const permissions = await repo.getAllGranted();
      permissions.get('shell')?.add('malicious_permission');
      
      expect(await repo.isAllowed('shell', 'malicious_permission')).toBe(false);
    });
  });
});