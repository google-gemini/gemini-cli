/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { PolicyIntegrityManager, IntegrityStatus } from './integrity.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Storage } from '../config/storage.js';

describe('PolicyIntegrityManager', () => {
  let integrityManager: PolicyIntegrityManager;
  let tempDir: string;
  let integrityStoragePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));
    integrityStoragePath = path.join(tempDir, 'policy_integrity.json');

    vi.spyOn(Storage, 'getPolicyIntegrityStoragePath').mockReturnValue(
      integrityStoragePath,
    );

    integrityManager = new PolicyIntegrityManager();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('checkIntegrity', () => {
    it('should return NEW if no stored hash', async () => {
      const policyDir = path.join(tempDir, 'policies');
      await fs.mkdir(policyDir);
      await fs.writeFile(path.join(policyDir, 'a.toml'), 'contentA');

      const result = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );
      expect(result.status).toBe(IntegrityStatus.NEW);
      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64);
      expect(result.fileCount).toBe(1);
    });

    it('should return MATCH if stored hash matches', async () => {
      const policyDir = path.join(tempDir, 'policies');
      await fs.mkdir(policyDir);
      await fs.writeFile(path.join(policyDir, 'a.toml'), 'contentA');

      // First run to get the hash
      const resultNew = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );
      const currentHash = resultNew.hash;

      // Save the hash to mock storage
      await fs.writeFile(
        integrityStoragePath,
        JSON.stringify({ 'workspace:id': currentHash }),
      );

      const result = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );
      expect(result.status).toBe(IntegrityStatus.MATCH);
      expect(result.hash).toBe(currentHash);
    });

    it('should return MISMATCH if stored hash differs', async () => {
      const policyDir = path.join(tempDir, 'policies');
      await fs.mkdir(policyDir);
      await fs.writeFile(path.join(policyDir, 'a.toml'), 'contentA');

      const resultNew = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );
      const currentHash = resultNew.hash;

      // Save a different hash
      await fs.writeFile(
        integrityStoragePath,
        JSON.stringify({ 'workspace:id': 'different_hash' }),
      );

      const result = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );
      expect(result.status).toBe(IntegrityStatus.MISMATCH);
      expect(result.hash).toBe(currentHash);
    });

    it('should result in different hash if filename changes', async () => {
      const policyDir1 = path.join(tempDir, 'policies1');
      await fs.mkdir(policyDir1);
      await fs.writeFile(path.join(policyDir1, 'a.toml'), 'contentA');

      const result1 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir1,
      );

      const policyDir2 = path.join(tempDir, 'policies2');
      await fs.mkdir(policyDir2);
      await fs.writeFile(path.join(policyDir2, 'b.toml'), 'contentA');

      const result2 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir2,
      );

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should result in different hash if content changes', async () => {
      const policyDir = path.join(tempDir, 'policies');
      await fs.mkdir(policyDir);

      await fs.writeFile(path.join(policyDir, 'a.toml'), 'contentA');
      const result1 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );

      await fs.writeFile(path.join(policyDir, 'a.toml'), 'contentB');
      const result2 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir,
      );

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should be deterministic (sort order)', async () => {
      const policyDir1 = path.join(tempDir, 'policies1');
      await fs.mkdir(policyDir1);
      await fs.writeFile(path.join(policyDir1, 'a.toml'), 'contentA');
      await fs.writeFile(path.join(policyDir1, 'b.toml'), 'contentB');

      const result1 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir1,
      );

      // Re-read with same files but they might be in different order in readdir
      // PolicyIntegrityManager should sort them.
      const result2 = await integrityManager.checkIntegrity(
        'workspace',
        'id',
        policyDir1,
      );

      expect(result1.hash).toBe(result2.hash);
    });

    it('should handle multiple projects correctly', async () => {
      const dirA = path.join(tempDir, 'dirA');
      await fs.mkdir(dirA);
      await fs.writeFile(path.join(dirA, 'p.toml'), 'contentA');

      const dirB = path.join(tempDir, 'dirB');
      await fs.mkdir(dirB);
      await fs.writeFile(path.join(dirB, 'p.toml'), 'contentB');

      const { hash: hashA } = await integrityManager.checkIntegrity(
        'workspace',
        'idA',
        dirA,
      );
      const { hash: hashB } = await integrityManager.checkIntegrity(
        'workspace',
        'idB',
        dirB,
      );

      // Save to storage
      await fs.writeFile(
        integrityStoragePath,
        JSON.stringify({
          'workspace:idA': hashA,
          'workspace:idB': 'oldHashB',
        }),
      );

      // Project A should match
      const resultA = await integrityManager.checkIntegrity(
        'workspace',
        'idA',
        dirA,
      );
      expect(resultA.status).toBe(IntegrityStatus.MATCH);
      expect(resultA.hash).toBe(hashA);

      // Project B should mismatch
      const resultB = await integrityManager.checkIntegrity(
        'workspace',
        'idB',
        dirB,
      );
      expect(resultB.status).toBe(IntegrityStatus.MISMATCH);
      expect(resultB.hash).toBe(hashB);
    });
  });

  describe('acceptIntegrity', () => {
    it('should save the hash to storage', async () => {
      await integrityManager.acceptIntegrity('workspace', 'id', 'hash123');

      const stored = JSON.parse(
        await fs.readFile(integrityStoragePath, 'utf-8'),
      );
      expect(stored['workspace:id']).toBe('hash123');
    });

    it('should update existing hash', async () => {
      await fs.writeFile(
        integrityStoragePath,
        JSON.stringify({ 'other:id': 'otherhash' }),
      );

      await integrityManager.acceptIntegrity('workspace', 'id', 'hash123');

      const stored = JSON.parse(
        await fs.readFile(integrityStoragePath, 'utf-8'),
      );
      expect(stored['other:id']).toBe('otherhash');
      expect(stored['workspace:id']).toBe('hash123');
    });
  });
});
