/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { SecretStorage } from './types.js';
import { GEMINI_DIR, homedir } from '../../utils/paths.js';

/**
 * Type guard for NodeJS.ErrnoException
 */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    ('code' in error ||
      'errno' in error ||
      'path' in error ||
      'syscall' in error)
  );
}

/**
 * Encrypted file-based storage for secrets, used as a fallback
 * when a system keychain (like keytar) is unavailable.
 */
export class FileSecretStorage implements SecretStorage {
  private readonly secretFilePath: string;
  private readonly encryptionKey: Buffer;

  constructor(serviceName: string) {
    const configDir = path.join(homedir(), GEMINI_DIR);
    // Sanitize service name for filename
    const sanitizedService = serviceName.replace(/[^a-zA-Z0-9-_.]/g, '_');
    this.secretFilePath = path.join(
      configDir,
      `secrets-${sanitizedService}.json`,
    );
    this.encryptionKey = this.deriveEncryptionKey();
  }

  private deriveEncryptionKey(): Buffer {
    const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli-secrets`;
    return crypto.scryptSync('gemini-cli-secrets', salt, 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

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

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.secretFilePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(this.secretFilePath, 'utf-8');
      const decrypted = this.decrypt(data);
      const parsed = JSON.parse(decrypted) as unknown;

      if (parsed === null || typeof parsed !== 'object') {
        throw new Error('Secret file content is not a valid object');
      }

      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }

      return result;
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return {};
      }

      const message = error instanceof Error ? error.message : '';

      if (
        message.includes('Invalid encrypted data format') ||
        message.includes('Unsupported state or unable to authenticate data')
      ) {
        throw new Error('Secret file corrupted');
      }
      throw error;
    }
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    await this.ensureDirectoryExists();

    const json = JSON.stringify(secrets, null, 2);
    const encrypted = this.encrypt(json);

    await fs.writeFile(this.secretFilePath, encrypted, { mode: 0o600 });
  }

  async setSecret(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    secrets[key] = value;
    await this.saveSecrets(secrets);
  }

  async getSecret(key: string): Promise<string | null> {
    const secrets = await this.loadSecrets();
    return secrets[key] ?? null;
  }

  async deleteSecret(key: string): Promise<void> {
    const secrets = await this.loadSecrets();
    if (!(key in secrets)) {
      throw new Error(`No secret found for key: ${key}`);
    }
    delete secrets[key];
    await this.saveSecrets(secrets);
  }

  async listSecrets(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    return Object.keys(secrets);
  }

  async clearAll(): Promise<void> {
    try {
      await fs.unlink(this.secretFilePath);
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}
