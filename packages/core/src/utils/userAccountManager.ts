/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fsp, readFileSync } from 'node:fs';
import { Storage } from '../config/storage.js';

interface UserAccounts {
  active: string | null;
  old: string[];
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
    const defaultState = { active: null, old: [] };
    if (!content.trim()) {
      return defaultState;
    }

    const parsed = JSON.parse(content);

    // Inlined validation logic
    if (typeof parsed !== 'object' || parsed === null) {
      console.log('Invalid accounts file schema, starting fresh.');
      return defaultState;
    }
    const { active, old } = parsed as Partial<UserAccounts>;
    const isValid =
      (active === undefined || active === null || typeof active === 'string') &&
      (old === undefined ||
        (Array.isArray(old) && old.every((i) => typeof i === 'string')));

    if (!isValid) {
      console.log('Invalid accounts file schema, starting fresh.');
      return defaultState;
    }

    return {
      active: parsed.active ?? null,
      old: parsed.old ?? [],
    };
  }

  private readAccountsSync(filePath: string): UserAccounts {
    const defaultState = { active: null, old: [] };
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseAndValidateAccounts(content);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return defaultState;
      }
      console.log('Error during sync read of accounts, starting fresh.', error);
      return defaultState;
    }
  }

  private async readAccounts(filePath: string): Promise<UserAccounts> {
    const defaultState = { active: null, old: [] };
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return this.parseAndValidateAccounts(content);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return defaultState;
      }
      console.log('Could not parse accounts file, starting fresh.', error);
      return defaultState;
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
