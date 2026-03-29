/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fsp, readFileSync } from 'node:fs';
import { Storage } from '../config/storage.js';
import { debugLogger } from './debugLogger.js';
import { z } from 'zod';

const userAccountsSchema = z.object({
  active: z.string().nullable().default(null),
  old: z.array(z.string()).default([]),
});

type UserAccounts = z.infer<typeof userAccountsSchema>;

function createDefaultAccountsState(): UserAccounts {
  return { active: null, old: [] };
}

export class UserAccountManager {
  private getGoogleAccountsCachePath(): string {
    return Storage.getGoogleAccountsPath();
  }

  /**
   * Parses and validates the string content of an accounts file.
   * @param content The raw string content from the file.
   * @returns A valid UserAccounts object.
   */
  private parseAndValidateAccounts(content: string): UserAccounts {
    if (!content.trim()) {
      return createDefaultAccountsState();
    }

    const parsed: unknown = JSON.parse(content);
    const result = userAccountsSchema.safeParse(parsed);

    if (!result.success) {
      debugLogger.log('Invalid accounts file schema, starting fresh.');
      return createDefaultAccountsState();
    }

    return result.data;
  }

  private readAccountsSync(filePath: string): UserAccounts {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseAndValidateAccounts(content);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return createDefaultAccountsState();
      }
      debugLogger.log(
        'Error during sync read of accounts, starting fresh.',
        error,
      );
      return createDefaultAccountsState();
    }
  }

  private async readAccounts(filePath: string): Promise<UserAccounts> {
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return this.parseAndValidateAccounts(content);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return createDefaultAccountsState();
      }
      debugLogger.log('Could not parse accounts file, starting fresh.', error);
      return createDefaultAccountsState();
    }
  }

  async cacheGoogleAccount(email: string): Promise<void> {
    const filePath = this.getGoogleAccountsCachePath();
    await fsp.mkdir(path.dirname(filePath), { recursive: true });

    const accounts = await this.readAccounts(filePath);

    if (accounts.active && accounts.active !== email) {
      if (!accounts.old.includes(accounts.active)) {
        accounts.old.push(accounts.active);
      }
    }

    // If the new email was in the old list, remove it
    accounts.old = accounts.old.filter((oldEmail) => oldEmail !== email);

    accounts.active = email;
    await fsp.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
  }

  getCachedGoogleAccount(): string | null {
    const filePath = this.getGoogleAccountsCachePath();
    const accounts = this.readAccountsSync(filePath);
    return accounts.active;
  }

  getLifetimeGoogleAccounts(): number {
    const filePath = this.getGoogleAccountsCachePath();
    const accounts = this.readAccountsSync(filePath);
    const allAccounts = new Set(accounts.old);
    if (accounts.active) {
      allAccounts.add(accounts.active);
    }
    return allAccounts.size;
  }

  async clearCachedGoogleAccount(): Promise<void> {
    const filePath = this.getGoogleAccountsCachePath();
    const accounts = await this.readAccounts(filePath);

    if (accounts.active) {
      if (!accounts.old.includes(accounts.active)) {
        accounts.old.push(accounts.active);
      }
      accounts.active = null;
    }

    await fsp.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
  }
}
