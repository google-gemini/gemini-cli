/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ConfigPermissionRepository } from './ConfigPermissionRepository.js';
import { Storage } from '../config/storage.js';

// Mock the storage module
vi.mock('../config/storage.js', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
  },
}));

const mockGetGlobalGeminiDir = vi.mocked(Storage.getGlobalGeminiDir);

describe('ConfigPermissionRepository', () => {
  let repo: ConfigPermissionRepository;
  let tempDir: string;
  let permissionsPath: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp('/tmp/gemini-permissions-test-');
    permissionsPath = path.join(tempDir, 'tool-permissions.json');
    
    // Mock the global gemini dir to use our temp directory
    mockGetGlobalGeminiDir.mockReturnValue(tempDir);
    
    repo = new ConfigPermissionRepository();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start with empty permissions when no file exists', async () => {
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      const permissions = await repo.getAllGranted();
      expect(permissions.size).toBe(0);
    });

    it('should load existing permissions from file', async () => {
      // Create a permissions file
      const existingData = {
        shell: ['git status', 'npm install'],
        memory: ['read_context'],
      };
      await fs.writeFile(permissionsPath, JSON.stringify(existingData, null, 2));
      
      // Create a new repository instance to trigger loading
      repo = new ConfigPermissionRepository();
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(true);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
      expect(await repo.isAllowed('shell', 'unknown')).toBe(false);
    });

    it('should handle malformed permissions file gracefully', async () => {
      // Create an invalid JSON file
      await fs.writeFile(permissionsPath, 'invalid json');
      
      // Should not throw and should start with empty permissions
      repo = new ConfigPermissionRepository();
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      const permissions = await repo.getAllGranted();
      expect(permissions.size).toBe(0);
    });

    it('should handle permissions file with invalid data structure', async () => {
      // Create a JSON file with invalid data structure
      const invalidData = {
        shell: 'not an array',
        memory: ['valid_array'],
      };
      await fs.writeFile(permissionsPath, JSON.stringify(invalidData));
      
      repo = new ConfigPermissionRepository();
      
      // Should load valid entries and ignore invalid ones
      expect(await repo.isAllowed('shell', 'anything')).toBe(false);
      expect(await repo.isAllowed('memory', 'valid_array')).toBe(true);
    });
  });

  describe('grant and persistence', () => {
    it('should grant permission and persist to file', async () => {
      await repo.grant('shell', 'git status');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      
      // Verify file was created and contains correct data
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data).toEqual({ shell: ['git status'] });
    });

    it('should handle multiple permissions for same tool', async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.shell).toContain('git status');
      expect(data.shell).toContain('npm install');
      expect(data.shell).toHaveLength(2);
    });

    it('should handle multiple tools', async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('memory', 'read_context');
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.shell).toEqual(['git status']);
      expect(data.memory).toEqual(['read_context']);
    });

    it('should create directory if it does not exist', async () => {
      // Use a nested path that doesn't exist
      const nestedDir = path.join(tempDir, 'nested', 'path');
      mockGetGlobalGeminiDir.mockReturnValue(nestedDir);
      
      repo = new ConfigPermissionRepository();
      await repo.grant('shell', 'git status');
      
      // Verify directory was created and file exists
      const nestedPermissionsPath = path.join(nestedDir, 'tool-permissions.json');
      expect(await fs.access(nestedPermissionsPath)).toBeUndefined();
    });
  });

  describe('revoke and persistence', () => {
    beforeEach(async () => {
      await repo.grant('shell', 'git status');
      await repo.grant('shell', 'npm install');
      await repo.grant('memory', 'read_context');
    });

    it('should revoke permission and update file', async () => {
      await repo.revoke('shell', 'git status');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(true);
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.shell).toEqual(['npm install']);
      expect(data.memory).toEqual(['read_context']);
    });

    it('should remove tool from file when all permissions revoked', async () => {
      await repo.revoke('shell', 'git status');
      await repo.revoke('shell', 'npm install');
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.shell).toBeUndefined();
      expect(data.memory).toEqual(['read_context']);
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

    it('should revoke all permissions for tool and update file', async () => {
      await repo.revokeAllForTool('shell');
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('shell', 'npm install')).toBe(false);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(true);
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.shell).toBeUndefined();
      expect(data.memory).toEqual(['read_context']);
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
      await repo.grant('memory', 'read_context');
    });

    it('should revoke all permissions and clear file', async () => {
      await repo.revokeAll();
      
      expect(await repo.isAllowed('shell', 'git status')).toBe(false);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(false);
      
      const fileContent = await fs.readFile(permissionsPath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data).toEqual({});
    });
  });

  describe('getAllGranted', () => {
    it('should return empty map when no permissions', async () => {
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
      
      // Verify original data is not affected
      expect(await repo.isAllowed('shell', 'malicious_permission')).toBe(false);
      
      const freshPermissions = await repo.getAllGranted();
      expect(freshPermissions.get('shell')).toEqual(new Set(['git status']));
    });
  });

  describe('lazy initialization', () => {
    it('should only initialize once', async () => {
      // Create a permissions file to test lazy loading
      const existingData = { shell: ['git status'] };
      await fs.writeFile(permissionsPath, JSON.stringify(existingData));
      
      // Multiple calls should all return consistent results, indicating single initialization
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
      expect(await repo.isAllowed('memory', 'read_context')).toBe(false);
      
      const permissions = await repo.getAllGranted();
      expect(permissions.get('shell')).toEqual(new Set(['git status']));
    });

    it('should initialize on first operation', async () => {
      // Create a permissions file before any operations
      const existingData = { shell: ['git status'] };
      await fs.writeFile(permissionsPath, JSON.stringify(existingData));
      
      // First check should load from file
      expect(await repo.isAllowed('shell', 'git status')).toBe(true);
    });
  });
});