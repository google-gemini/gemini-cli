/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
  type Mock,
} from 'vitest';
import { PolicyIntegrityManager, IntegrityStatus } from './integrity.js';

// Mock dependencies
vi.mock('../config/storage.js', () => ({
  Storage: {
    getPolicyIntegrityStoragePath: vi
      .fn()
      .mockReturnValue('/mock/storage/policy_integrity.json'),
  },
}));

vi.mock('./toml-loader.js', () => ({
  readPolicyFiles: vi.fn(),
}));

// Mock FS
const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: mockFs,
  readFile: mockFs.readFile,
  writeFile: mockFs.writeFile,
  mkdir: mockFs.mkdir,
}));

describe('PolicyIntegrityManager', () => {
  let integrityManager: PolicyIntegrityManager;
  let readPolicyFilesMock: Mock;

  beforeEach(async () => {
    vi.resetModules();
    const { readPolicyFiles } = await import('./toml-loader.js');
    readPolicyFilesMock = readPolicyFiles as Mock;
    integrityManager = new PolicyIntegrityManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkIntegrity', () => {
    it('should return NEW if no stored hash', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' }); // No stored file
      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);

      const result = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/dir',
      );
      expect(result.status).toBe(IntegrityStatus.NEW);
      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64);
      expect(result.fileCount).toBe(1);
    });

    it('should return MATCH if stored hash matches', async () => {
      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);
      // We can't easily get the expected hash without calling private method or re-implementing logic.
      // But we can run checkIntegrity once (NEW) to get the hash, then mock FS with that hash.
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      const resultNew = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/dir',
      );
      const currentHash = resultNew.hash;

      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          'project:id': currentHash,
        }),
      );

      const result = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/dir',
      );
      expect(result.status).toBe(IntegrityStatus.MATCH);
      expect(result.hash).toBe(currentHash);
      expect(result.fileCount).toBe(1);
    });

    it('should return MISMATCH if stored hash differs', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);
      const resultNew = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/dir',
      );
      const currentHash = resultNew.hash;

      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          'project:id': 'different_hash',
        }),
      );

      const result = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/dir',
      );
      expect(result.status).toBe(IntegrityStatus.MISMATCH);
      expect(result.hash).toBe(currentHash);
      expect(result.fileCount).toBe(1);
    });

    it('should result in different hash if filename changes', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);
      const result1 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/b.toml', content: 'contentA' },
      ]);
      const result2 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should result in different hash if content changes', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);
      const result1 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentB' },
      ]);
      const result2 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should be deterministic (sort order)', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/a.toml', content: 'contentA' },
        { path: '/project/policies/b.toml', content: 'contentB' },
      ]);
      const result1 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      readPolicyFilesMock.mockResolvedValue([
        { path: '/project/policies/b.toml', content: 'contentB' },
        { path: '/project/policies/a.toml', content: 'contentA' },
      ]);
      const result2 = await integrityManager.checkIntegrity(
        'project',
        'id',
        '/project/policies',
      );

      expect(result1.hash).toBe(result2.hash);
    });

    it('should handle multiple projects correctly', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      // First, get hashes for two different projects
      readPolicyFilesMock.mockResolvedValue([
        { path: '/dirA/p.toml', content: 'contentA' },
      ]);
      const { hash: hashA } = await integrityManager.checkIntegrity(
        'project',
        'idA',
        '/dirA',
      );

      readPolicyFilesMock.mockResolvedValue([
        { path: '/dirB/p.toml', content: 'contentB' },
      ]);
      const { hash: hashB } = await integrityManager.checkIntegrity(
        'project',
        'idB',
        '/dirB',
      );

      // Now mock storage with both
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          'project:idA': hashA,
          'project:idB': 'oldHashB', // Different from hashB
        }),
      );

      // Project A should match
      readPolicyFilesMock.mockResolvedValue([
        { path: '/dirA/p.toml', content: 'contentA' },
      ]);
      const resultA = await integrityManager.checkIntegrity(
        'project',
        'idA',
        '/dirA',
      );
      expect(resultA.status).toBe(IntegrityStatus.MATCH);
      expect(resultA.hash).toBe(hashA);

      // Project B should mismatch
      readPolicyFilesMock.mockResolvedValue([
        { path: '/dirB/p.toml', content: 'contentB' },
      ]);
      const resultB = await integrityManager.checkIntegrity(
        'project',
        'idB',
        '/dirB',
      );
      expect(resultB.status).toBe(IntegrityStatus.MISMATCH);
      expect(resultB.hash).toBe(hashB);
    });
  });

  describe('acceptIntegrity', () => {
    it('should save the hash to storage', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' }); // Start empty
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await integrityManager.acceptIntegrity('project', 'id', 'hash123');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/mock/storage/policy_integrity.json',
        JSON.stringify({ 'project:id': 'hash123' }, null, 2),
        'utf-8',
      );
    });

    it('should update existing hash', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          'other:id': 'otherhash',
        }),
      );
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await integrityManager.acceptIntegrity('project', 'id', 'hash123');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/mock/storage/policy_integrity.json',
        JSON.stringify(
          {
            'other:id': 'otherhash',
            'project:id': 'hash123',
          },
          null,
          2,
        ),
        'utf-8',
      );
    });
  });
});
