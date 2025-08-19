/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fsp, readFileSync } from 'node:fs';
import * as os from 'os';
import { GEMINI_DIR, GOOGLE_ACCOUNTS_FILENAME } from './paths.js';

interface UserAccounts {
  active: string | null;
  old: string[];
}

function getGoogleAccountsCachePath(): string {
  return path.join(os.homedir(), GEMINI_DIR, GOOGLE_ACCOUNTS_FILENAME);
}

/**
 * Parses and validates the string content of an accounts file.
 * @param content The raw string content from the file.
 * @returns A valid UserAccounts object.
 */
function parseAndValidateAccounts(content: string): UserAccounts {
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

function readAccountsSync(filePath: string): UserAccounts {
  const defaultState = { active: null, old: [] };
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseAndValidateAccounts(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return defaultState;
    }
    console.log('Error during sync read of accounts, starting fresh.', error);
    return defaultState;
  }
}

async function readAccounts(filePath: string): Promise<UserAccounts> {
  const defaultState = { active: null, old: [] };
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return parseAndValidateAccounts(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return defaultState;
    }
    console.log('Could not parse accounts file, starting fresh.', error);
    return defaultState;
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
  const filePath = getGoogleAccountsCachePath();
  const accounts = readAccountsSync(filePath);
  return accounts.active;
}

export function getLifetimeGoogleAccounts(): number {
  const filePath = getGoogleAccountsCachePath();
  const accounts = readAccountsSync(filePath);
  const allAccounts = new Set(accounts.old);
  if (accounts.active) {
    allAccounts.add(accounts.active);
  }
  return allAccounts.size;
}

export async function clearCachedGoogleAccount(): Promise<void> {
  const filePath = getGoogleAccountsCachePath();
  const accounts = await readAccounts(filePath);

  if (accounts.active) {
    if (!accounts.old.includes(accounts.active)) {
      accounts.old.push(accounts.active);
    }
    accounts.active = null;
  }

  await fsp.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
}
