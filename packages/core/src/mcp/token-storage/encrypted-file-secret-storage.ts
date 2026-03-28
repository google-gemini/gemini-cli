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

export class EncryptedFileSecretStorage implements SecretStorage {
  private readonly tokenFilePath: string;
  private readonly encryptionKey: Buffer;
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.tokenFilePath = path.join(configDir, 'extension-secrets-v1.json');
    this.encryptionKey = this.deriveEncryptionKey();
  }

  private deriveEncryptionKey(): Buffer {
    const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli`;
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
    const dir = path.dirname(this.tokenFilePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async loadSecrets(): Promise<Record<string, Record<string, string>>> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const decrypted = this.decrypt(data);
      const parsed: unknown = JSON.parse(decrypted);
      const result: Record<string, Record<string, string>> = {};
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [service, secrets] of Object.entries(parsed)) {
          if (typeof secrets === 'object' && secrets !== null) {
            result[service] = {};
            for (const [key, value] of Object.entries(secrets)) {
              if (typeof value === 'string') {
                result[service][key] = value;
              }
            }
          }
        }
      }
      return result;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      const errMessage = error instanceof Error ? error.message : String(error);
      if (
        errMessage.includes('Invalid encrypted data format') ||
        errMessage.includes('Unsupported state or unable to authenticate data')
      ) {
        throw new Error(
          `Corrupted secret file detected at: ${this.tokenFilePath}
` + `Please delete or rename this file to resolve the issue.`,
        );
      }
      throw error;
    }
  }

  private async saveSecrets(
    secrets: Record<string, Record<string, string>>,
  ): Promise<void> {
    await this.ensureDirectoryExists();
    const json = JSON.stringify(secrets, null, 2);
    const encrypted = this.encrypt(json);
    await fs.writeFile(this.tokenFilePath, encrypted, { mode: 0o600 });
  }

  async setSecret(key: string, value: string): Promise<void> {
    const allSecrets = await this.loadSecrets();
    if (!allSecrets[this.serviceName]) {
      allSecrets[this.serviceName] = {};
    }
    allSecrets[this.serviceName][key] = value;
    await this.saveSecrets(allSecrets);
  }

  async getSecret(key: string): Promise<string | null> {
    const allSecrets = await this.loadSecrets();
    return allSecrets[this.serviceName]?.[key] || null;
  }

  async deleteSecret(key: string): Promise<void> {
    const allSecrets = await this.loadSecrets();
    if (allSecrets[this.serviceName]?.[key]) {
      delete allSecrets[this.serviceName][key];
      if (Object.keys(allSecrets[this.serviceName]).length === 0) {
        delete allSecrets[this.serviceName];
      }

      if (Object.keys(allSecrets).length === 0) {
        try {
          await fs.unlink(this.tokenFilePath);
        } catch (error: unknown) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code !== 'ENOENT'
          ) {
            throw error;
          }
        }
      } else {
        await this.saveSecrets(allSecrets);
      }
    } else {
      throw new Error(`No secret found for key: ${key}`);
    }
  }

  async listSecrets(): Promise<string[]> {
    const allSecrets = await this.loadSecrets();
    return Object.keys(allSecrets[this.serviceName] || {});
  }
}
