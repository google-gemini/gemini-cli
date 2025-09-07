/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import type { PermissionRepository } from './PermissionRepository.js';

/**
 * Implementation of PermissionRepository that persists permissions to disk.
 * Stores permissions in the user's global .gemini directory.
 */
export class ConfigPermissionRepository implements PermissionRepository {
  private permissions: Map<string, Set<string>> = new Map();
  private readonly permissionsPath: string;
  private initializationPromise: Promise<void> | null = null;
  private writeQueue = Promise.resolve();

  constructor() {
    this.permissionsPath = path.join(
      Storage.getGlobalGeminiDir(),
      'tool-permissions.json',
    );
  }

  private ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = this.loadPermissions();
    return this.initializationPromise;
  }

  private async loadPermissions(): Promise<void> {
    try {
      const data = await fs.readFile(this.permissionsPath, 'utf-8');
      const parsed = JSON.parse(data);

      this.permissions.clear();
      for (const [toolId, permissionKeys] of Object.entries(parsed)) {
        if (Array.isArray(permissionKeys)) {
          this.permissions.set(toolId, new Set(permissionKeys));
        }
      }
    } catch (_error) {
      // File doesn't exist or is invalid, start with empty permissions
      this.permissions.clear();
    }
  }

  private async savePermissions(): Promise<void> {
    const data: Record<string, string[]> = {};
    this.permissions.forEach((permissionKeys, toolId) => {
      data[toolId] = Array.from(permissionKeys);
    });

    // Ensure the directory exists
    const dir = path.dirname(this.permissionsPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.permissionsPath, JSON.stringify(data, null, 2));
  }

  async isAllowed(toolId: string, permissionKey: string): Promise<boolean> {
    await this.ensureInitialized();
    const toolPermissions = this.permissions.get(toolId);
    return toolPermissions?.has(permissionKey) ?? false;
  }

  private performWrite(action: () => void): Promise<void> {
    const op = async () => {
      await this.ensureInitialized();
      action();
      await this.savePermissions();
    };
    // Chain the operation, ensuring it runs even if the previous one failed.
    this.writeQueue = this.writeQueue.then(op, op);
    return this.writeQueue;
  }

  async grant(toolId: string, permissionKey: string): Promise<void> {
    return this.performWrite(() => {
      if (!this.permissions.has(toolId)) {
        this.permissions.set(toolId, new Set());
      }
      this.permissions.get(toolId)!.add(permissionKey);
    });
  }

  async revoke(toolId: string, permissionKey: string): Promise<void> {
    return this.performWrite(() => {
      const toolPermissions = this.permissions.get(toolId);
      if (toolPermissions) {
        toolPermissions.delete(permissionKey);
        if (toolPermissions.size === 0) {
          this.permissions.delete(toolId);
        }
      }
    });
  }

  async revokeAllForTool(toolId: string): Promise<void> {
    return this.performWrite(() => {
      this.permissions.delete(toolId);
    });
  }

  async revokeAll(): Promise<void> {
    return this.performWrite(() => {
      this.permissions.clear();
    });
  }

  async getAllGranted(): Promise<Map<string, Set<string>>> {
    await this.ensureInitialized();
    // Return a copy to prevent external mutation
    const result = new Map<string, Set<string>>();
    this.permissions.forEach((permissions, toolId) => {
      result.set(toolId, new Set(permissions));
    });
    return result;
  }
}
