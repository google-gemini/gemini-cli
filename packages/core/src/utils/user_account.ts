/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fsp, existsSync, readFileSync } from 'node:fs';
import * as os from 'os';
import { GEMINI_DIR, GOOGLE_ACCOUNTS_FILENAME } from './paths.js';

interface UserAccounts {
  active: string | null;
  old: string[];
}

function getGoogleAccountsCachePath(): string {
  return path.join(os.homedir(), GEMINI_DIR, GOOGLE_ACCOUNTS_FILENAME);
}

async function readAccounts(filePath: string): Promise<UserAccounts> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    if (!content.trim()) {
      return { active: null, old: [] };
    }
    return JSON.parse(content) as UserAccounts;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // File doesn't exist, which is fine.
      return { active: null, old: [] };
    }
    // File is corrupted or not valid JSON, start with a fresh object.
    console.debug('Could not parse accounts file, starting fresh.', error);
    return { active: null, old: [] };
  }
}

export async function cacheGoogleAccount(email: string): Promise<void> {
  const filePath = getGoogleAccountsCachePath();
  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  const accounts = await readAccounts(filePath);

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

export function getCachedGoogleAccount(): string | null {
  try {
    const filePath = getGoogleAccountsCachePath();
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8').trim();
      if (!content) {
        return null;
      }
      const accounts: UserAccounts = JSON.parse(content);
      return accounts.active;
    }
    return null;
  } catch (error) {
    console.debug('Error reading cached Google Account:', error);
    return null;
  }
}

export function getLifetimeGoogleAccounts(): number {
  try {
    const filePath = getGoogleAccountsCachePath();
    if (!existsSync(filePath)) {
      return 0;
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) {
      return 0;
    }
    const accounts: UserAccounts = JSON.parse(content);
    let count = accounts.old.length;
    if (accounts.active) {
      count++;
    }
    return count;
  } catch (error) {
    console.debug('Error reading lifetime Google Accounts:', error);
    return 0;
  }
}

export async function clearCachedGoogleAccount(): Promise<void> {
  const filePath = getGoogleAccountsCachePath();
  if (!existsSync(filePath)) {
    return;
  }

  const accounts = await readAccounts(filePath);

  if (accounts.active) {
    if (!accounts.old.includes(accounts.active)) {
      accounts.old.push(accounts.active);
    }
    accounts.active = null;
  }

  await fsp.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
}
