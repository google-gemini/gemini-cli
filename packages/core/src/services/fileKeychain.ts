/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { lock } from 'proper-lockfile';
import type { Keychain } from './keychainTypes.js';
import { GEMINI_DIR, homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';

type CredentialsData = Record<string, Record<string, string>>;

/**
 * Looks up an own entry only, so service and account names such as
 * `__proto__` or `constructor` never resolve to `Object.prototype` members.
 * Writes use computed keys in object literals, which always create own
 * properties (even for `__proto__`), instead of assignment.
 */
function getOwn<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

// A lock left behind by a crashed process is considered stale (and taken
// over) after this long. Live holders refresh it every LOCK_STALE_MS / 2.
const LOCK_STALE_MS = 5000;
// Up to ~7 seconds of waiting, so a stale lock is always recovered before
// we give up.
const LOCK_RETRY_OPTIONS = {
  retries: 70,
  minTimeout: 20,
  maxTimeout: 100,
};
const RENAME_MAX_ATTEMPTS = 5;

/**
 * On Windows, rename can fail transiently while another process (antivirus,
 * search indexer, a concurrent reader) has the destination open. EACCES is
 * only transient there; elsewhere it is a real permission error.
 */
function isRetryableRenameError(code: string | undefined): boolean {
  return (
    code === 'EBUSY' ||
    code === 'EPERM' ||
    (code === 'EACCES' && os.platform() === 'win32')
  );
}

export class FileKeychain implements Keychain {
  private readonly tokenFilePath: string;
  private readonly encryptionKey: Buffer;

  constructor() {
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.tokenFilePath = path.join(configDir, 'gemini-credentials.json');
    this.encryptionKey = this.deriveEncryptionKey();
  }

  private deriveEncryptionKey(): Buffer {
    const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli`;
    return crypto.scryptSync('gemini-cli-oauth', salt, 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
      {
        authTagLength: 16,
      },
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    if (iv.length !== 12 && iv.length !== 16) {
      throw new Error('Invalid IV length: Must be 12 or 16 bytes');
    }

    if (authTag.length !== 16) {
      throw new Error('Invalid authentication tag length: Must be 16 bytes');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
      { authTagLength: 16 },
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.tokenFilePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async loadData(): Promise<CredentialsData> {
    let data: string;
    try {
      data = await fs.readFile(this.tokenFilePath, 'utf-8');
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {};
      }
      throw error;
    }

    try {
      const decrypted = this.decrypt(data);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(decrypted) as CredentialsData;
    } catch {
      throw new Error(
        `Corrupted credentials file detected at: ${this.tokenFilePath}\n` +
          `Please delete or rename this file to resolve the issue.`,
      );
    }
  }

  /**
   * Writes the credentials atomically: the encrypted payload goes to a unique
   * temporary file that is then renamed over the credentials file, so a crash
   * or a full disk can never leave a truncated (undecryptable) file behind.
   */
  private async saveData(data: CredentialsData): Promise<void> {
    await this.ensureDirectoryExists();
    const json = JSON.stringify(data, null, 2);
    const encrypted = this.encrypt(json);
    const tmpPath = `${this.tokenFilePath}.${crypto.randomUUID()}.tmp`;
    let renamed = false;
    try {
      await fs.writeFile(tmpPath, encrypted, { mode: 0o600 });
      for (let attempt = 1; ; attempt++) {
        try {
          await fs.rename(tmpPath, this.tokenFilePath);
          renamed = true;
          break;
        } catch (error: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const code = (error as NodeJS.ErrnoException).code;
          if (!isRetryableRenameError(code) || attempt >= RENAME_MAX_ATTEMPTS) {
            throw error;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 2 ** (attempt - 1) * 50),
          );
        }
      }
    } finally {
      if (!renamed) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
      }
    }
  }

  /**
   * Runs a read-modify-write of the credentials file under an exclusive
   * cross-process lock, so concurrent writers (e.g. a token refresh in one
   * terminal and a login in another) cannot overwrite each other's entries.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureDirectoryExists();
    // `realpath: false` lets us lock the credentials file before it exists.
    const release = await lock(this.tokenFilePath, {
      realpath: false,
      stale: LOCK_STALE_MS,
      retries: LOCK_RETRY_OPTIONS,
    });
    try {
      return await fn();
    } finally {
      try {
        await release();
      } catch (error) {
        debugLogger.error('Failed to release credentials file lock:', error);
      }
    }
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    const data = await this.loadData();
    const serviceData = getOwn(data, service);
    return (serviceData && getOwn(serviceData, account)) ?? null;
  }

  async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    await this.withLock(async () => {
      const data = await this.loadData();
      await this.saveData({
        ...data,
        [service]: { ...getOwn(data, service), [account]: password },
      });
    });
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.loadData();
      const serviceData = getOwn(data, service);
      if (!serviceData || !Object.hasOwn(serviceData, account)) {
        return false;
      }

      delete serviceData[account];

      if (Object.keys(serviceData).length === 0) {
        delete data[service];
      }

      if (Object.keys(data).length === 0) {
        try {
          await fs.unlink(this.tokenFilePath);
        } catch (error: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const err = error as NodeJS.ErrnoException;
          if (err.code !== 'ENOENT') {
            throw error;
          }
        }
      } else {
        await this.saveData(data);
      }
      return true;
    });
  }

  async findCredentials(
    service: string,
  ): Promise<Array<{ account: string; password: string }>> {
    const data = await this.loadData();
    const serviceData = getOwn(data, service) ?? {};
    return Object.entries(serviceData).map(([account, password]) => ({
      account,
      password,
    }));
  }
}
