/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { readPolicyFiles } from './toml-loader.js';
import { debugLogger } from '../utils/debugLogger.js';
import { isNodeError } from '../utils/errors.js';

export enum IntegrityStatus {
  MATCH = 'MATCH',
  MISMATCH = 'MISMATCH',
  NEW = 'NEW',
}

export interface IntegrityResult {
  status: IntegrityStatus;
  hash: string;
  fileCount: number;
}

interface StoredIntegrityData {
  [key: string]: string; // key = scope:identifier, value = hash
}

export class PolicyIntegrityManager {
  /**
   * Checks the integrity of policies in a given directory against the stored hash.
   *
   * @param scope The scope of the policy (e.g., 'project', 'user').
   * @param identifier A unique identifier for the policy scope (e.g., project path).
   * @param policyDir The directory containing the policy files.
   * @returns IntegrityResult indicating if the current policies match the stored hash.
   */
  async checkIntegrity(
    scope: string,
    identifier: string,
    policyDir: string,
  ): Promise<IntegrityResult> {
    const { hash: currentHash, fileCount } =
      await PolicyIntegrityManager.calculateIntegrityHash(policyDir);
    const storedData = await this.loadIntegrityData();
    const key = this.getIntegrityKey(scope, identifier);
    const storedHash = storedData[key];

    if (!storedHash) {
      return { status: IntegrityStatus.NEW, hash: currentHash, fileCount };
    }

    if (storedHash === currentHash) {
      return { status: IntegrityStatus.MATCH, hash: currentHash, fileCount };
    }

    return { status: IntegrityStatus.MISMATCH, hash: currentHash, fileCount };
  }

  /**
   * Accepts and persists the current integrity hash for a given policy scope.
   *
   * @param scope The scope of the policy.
   * @param identifier A unique identifier for the policy scope (e.g., project path).
   * @param hash The hash to persist.
   */
  async acceptIntegrity(
    scope: string,
    identifier: string,
    hash: string,
  ): Promise<void> {
    const storedData = await this.loadIntegrityData();
    const key = this.getIntegrityKey(scope, identifier);
    storedData[key] = hash;
    await this.saveIntegrityData(storedData);
  }

  /**
   * Calculates a SHA-256 hash of all policy files in the directory.
   * The hash includes the relative file path and content to detect renames and modifications.
   *
   * @param policyDir The directory containing the policy files.
   * @returns The calculated hash and file count
   */
  private static async calculateIntegrityHash(
    policyDir: string,
  ): Promise<{ hash: string; fileCount: number }> {
    try {
      const files = await readPolicyFiles(policyDir);

      // Sort files by path to ensure deterministic hashing
      files.sort((a, b) => a.path.localeCompare(b.path));

      const hash = crypto.createHash('sha256');

      for (const file of files) {
        const relativePath = path.relative(policyDir, file.path);
        // Include relative path and content in the hash
        hash.update(relativePath);
        hash.update('\0'); // Separator
        hash.update(file.content);
        hash.update('\0'); // Separator
      }

      return { hash: hash.digest('hex'), fileCount: files.length };
    } catch (error) {
      debugLogger.error('Failed to calculate policy integrity hash', error);
      // Return a unique hash (random) to force a mismatch if calculation fails?
      // Or throw? Throwing is better so we don't accidentally accept/deny corrupted state.
      throw error;
    }
  }

  private getIntegrityKey(scope: string, identifier: string): string {
    return `${scope}:${identifier}`;
  }

  private async loadIntegrityData(): Promise<StoredIntegrityData> {
    const storagePath = Storage.getPolicyIntegrityStoragePath();
    try {
      const content = await fs.readFile(storagePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        Object.values(parsed).every((v) => typeof v === 'string')
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return parsed as StoredIntegrityData;
      }
      debugLogger.warn('Invalid policy integrity data format');
      return {};
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {};
      }
      debugLogger.error('Failed to load policy integrity data', error);
      return {};
    }
  }

  private async saveIntegrityData(data: StoredIntegrityData): Promise<void> {
    const storagePath = Storage.getPolicyIntegrityStoragePath();
    try {
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      debugLogger.error('Failed to save policy integrity data', error);
      throw error;
    }
  }
}
