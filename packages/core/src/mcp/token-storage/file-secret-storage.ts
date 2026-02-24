/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs, statSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';
import type { SecretStorage } from './types.js';
import { GEMINI_DIR, homedir } from '../../utils/paths.js';

const execAsync = promisify(exec);

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
 *
 * Security features:
 * 1. AES-256-GCM encryption for authenticated encryption.
 * 2. Key derivation using scrypt with random salt (v2) or machine-unique salt (v1).
 * 3. Deep Hardware Binding: Incorporates Baseboard Serials, Disk Serials, and Machine UUIDs.
 * 4. Supports optional user-provided master key via GEMINI_MASTER_KEY.
 * 5. Strict file system permissions (0600).
 * 6. Hardcoded pepper for key derivation.
 * 7. Increased scrypt cost parameters (N=65536).
 * 8. System Keychain CLI (security/secret-tool) integration for Master Key storage.
 * 9. Environmental binding to file Inode and Birthtime to detect illegal moves.
 * 10. Installation ID: A hidden 3rd-factor file (.gemini_id) in the home directory.
 * 11. Plaintext Padding: Random noise added to secrets to obfuscate data length and count.
 * 12. Secret-Level Double-Encryption: Each secret is individually encrypted with a key derived from its name.
 * 13. Atomic Writes: Uses temporary files and renames to prevent data corruption.
 */
export class FileSecretStorage implements SecretStorage {
  private readonly secretFilePath: string;
  private readonly installationIdPath: string;
  private encryptionKey: Buffer | null = null;
  private readonly serviceName: string;
  private initPromise: Promise<void> | null = null;

  // Pepper to add extra entropy to the password
  private static readonly PEPPER = '334994f0-3773-45a8-940a-5d468134703b';

  private static machineIdentifierCache: string | null = null;

  constructor(serviceName: string) {
    const configDir = path.join(homedir(), GEMINI_DIR);
    const sanitizedService = serviceName.replace(/[^a-zA-Z0-9-_.]/g, '_');

    this.secretFilePath = path.join(
      configDir,
      `.sys-${sanitizedService}-cache.db`,
    );
    this.installationIdPath = path.join(homedir(), '.gemini_id');
    this.serviceName = serviceName;
  }

  /**
   * Retrieves or creates a unique installation ID.
   */
  private async getInstallationId(): Promise<string> {
    try {
      const id = await fs.readFile(this.installationIdPath, 'utf-8');
      return id.trim();
    } catch {
      const newId = crypto.randomBytes(32).toString('hex');
      try {
        await fs.writeFile(this.installationIdPath, newId, { mode: 0o600 });
      } catch {
        // Fallback to hardware-only
      }
      return newId;
    }
  }

  private async ensureInitialized(
    salt?: Buffer,
    version: 'v1' | 'v2' = 'v2',
  ): Promise<void> {
    if (this.encryptionKey) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.encryptionKey = await this.deriveEncryptionKey(salt, version);
      })();
    }
    return this.initPromise;
  }

  private async getPersistentSystemSecret(): Promise<string | null> {
    const account = `gemini-cli-master-${this.serviceName}`;
    const service = 'gemini-cli-secret-storage';

    try {
      if (os.platform() === 'darwin') {
        const { stdout } = await execAsync(
          `security find-generic-password -s "${service}" -a "${account}" -w`,
        );
        return stdout.trim();
      } else if (os.platform() === 'linux') {
        const { stdout } = await execAsync(
          `secret-tool lookup service "${service}" account "${account}"`,
        );
        return stdout.trim() || null;
      }
    } catch {
      // Not found
    }
    return null;
  }

  private async setPersistentSystemSecret(secret: string): Promise<void> {
    const account = `gemini-cli-master-${this.serviceName}`;
    const service = 'gemini-cli-secret-storage';

    try {
      if (os.platform() === 'darwin') {
        await execAsync(
          `security add-generic-password -s "${service}" -a "${account}" -w "${secret}" -U`,
        );
      } else if (os.platform() === 'linux') {
        await execAsync(
          `echo "${secret}" | secret-tool store --label="Gemini CLI Secret Key" service "${service}" account "${account}"`,
        );
      }
    } catch {
      // Failed to store
    }
  }

  /**
   * Derives a strong encryption key with deep hardware binding.
   */
  private async deriveEncryptionKey(
    providedSalt?: Buffer,
    version: 'v1' | 'v2' = 'v2',
  ): Promise<Buffer> {
    if (!FileSecretStorage.machineIdentifierCache) {
      try {
        const [uuid, baseboard, disks, network] = await Promise.all([
          si.uuid(),
          si.baseboard(),
          si.diskLayout(),
          si.networkInterfaces(),
        ]);

        // Deep hardware fingerprint including MAC addresses
        const macs = Array.isArray(network)
          ? network
              .map((n) => n.mac)
              .filter((m) => m && m !== '00:00:00:00:00:00')
              .sort()
              .join(',')
          : '';

        FileSecretStorage.machineIdentifierCache = [
          uuid.os,
          uuid.hardware,
          baseboard.serial,
          disks
            .map((d) => d.serialNum)
            .filter(Boolean)
            .join(','),
          macs,
          os.hostname(),
          os.userInfo().username,
        ]
          .filter(Boolean)
          .join('-');
      } catch {
        FileSecretStorage.machineIdentifierCache = `${os.hostname()}-${os.userInfo().username}`;
      }
    }
    const machineIdentifier = FileSecretStorage.machineIdentifierCache;

    const userSecret = process.env['GEMINI_MASTER_KEY'] || '';

    let fsBinding = '';
    if (version === 'v2') {
      try {
        const stats = statSync(this.secretFilePath);
        fsBinding = `${stats.ino}-${stats.birthtimeMs}`;
      } catch {
        // File doesn't exist yet
      }
    }

    let systemSecret = '';
    if (version === 'v2') {
      systemSecret = (await this.getPersistentSystemSecret()) || '';
      if (!systemSecret && !providedSalt) {
        systemSecret = crypto.randomBytes(32).toString('hex');
        await this.setPersistentSystemSecret(systemSecret);
      }
    }

    const installationId =
      version === 'v2' ? await this.getInstallationId() : '';

    const password =
      version === 'v2'
        ? `${FileSecretStorage.PEPPER}-v2-${this.serviceName}-${machineIdentifier}-${fsBinding}-${systemSecret}-${installationId}-${userSecret}`
        : `gemini-cli-secret-v1-${this.serviceName}-${userSecret}`;

    let salt: Buffer;
    if (providedSalt) {
      salt = providedSalt;
    } else {
      salt = crypto
        .createHash('sha256')
        .update(`salt-${machineIdentifier}`)
        .digest();
    }

    const N = version === 'v2' ? 65536 : 16384;
    const r = 8;
    const p = 1;

    return new Promise((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        32,
        { N, r, p, maxmem: 128 * 1024 * 1024 },
        (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey);
          }
        },
      );
    });
  }

  /**
   * Primary AES-256-GCM encryption
   */
  private encryptBlob(text: string, key: Buffer): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Primary AES-256-GCM decryption
   */
  private decryptBlob(encryptedData: string, key: Buffer): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Secret-Level Inner Encryption (Double-Lock)
   * Derives a unique key for EACH secret based on its name.
   */
  private async innerEncrypt(key: string, value: string): Promise<string> {
    if (!this.encryptionKey) throw new Error('Not initialized');

    // Quick HKDF-like derivation for inner key
    const innerKey = crypto
      .createHmac('sha256', this.encryptionKey)
      .update(`inner-key-${key}`)
      .digest();

    return this.encryptBlob(value, innerKey);
  }

  private async innerDecrypt(
    key: string,
    encryptedValue: string,
  ): Promise<string> {
    if (!this.encryptionKey) throw new Error('Not initialized');

    const innerKey = crypto
      .createHmac('sha256', this.encryptionKey)
      .update(`inner-key-${key}`)
      .digest();

    return this.decryptBlob(encryptedValue, innerKey);
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.secretFilePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    let data: string;
    try {
      data = await fs.readFile(this.secretFilePath, 'utf-8');
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        try {
          const configDir = path.dirname(this.secretFilePath);
          const sanitizedService = this.serviceName.replace(
            /[^a-zA-Z0-9-_.]/g,
            '_',
          );
          const oldPath = path.join(
            configDir,
            `secrets-${sanitizedService}.json`,
          );
          data = await fs.readFile(oldPath, 'utf-8');
        } catch {
          return {};
        }
      } else {
        throw error;
      }
    }

    let decrypted: string;
    try {
      if (data.startsWith('v2:')) {
        const parts = data.split(':');
        if (parts.length !== 6) throw new Error('Invalid v2 format');

        const salt = Buffer.from(parts[1], 'hex');
        await this.ensureInitialized(salt, 'v2');

        if (!this.encryptionKey) throw new Error('Init failed');
        decrypted = this.decryptBlob(
          `${parts[2]}:${parts[3]}:${parts[4]}`,
          this.encryptionKey,
        );
      } else {
        await this.ensureInitialized(undefined, 'v1');
        if (!this.encryptionKey) throw new Error('Init failed');
        decrypted = this.decryptBlob(data, this.encryptionKey);
      }

      let json = decrypted;
      const isV2 = data.startsWith('v2:');

      if (isV2) {
        try {
          const parsedWrapper = JSON.parse(decrypted) as unknown;
          if (
            parsedWrapper &&
            typeof parsedWrapper === 'object' &&
            'data' in parsedWrapper &&
            typeof parsedWrapper.data === 'string'
          ) {
            json = parsedWrapper.data;
          }
        } catch {
          // No padding
        }
      }

      const parsedBlob = JSON.parse(json) as unknown;
      if (parsedBlob === null || typeof parsedBlob !== 'object') {
        throw new Error('Secret file content is not a valid object');
      }

      const result: Record<string, string> = {};

      // Perform inner decryption for each secret
      for (const [key, value] of Object.entries(parsedBlob)) {
        if (typeof value === 'string') {
          try {
            // v2 files use inner encryption. v1 files are plaintext inside the blob.
            result[key] = isV2 ? await this.innerDecrypt(key, value) : value;
          } catch {
            // If inner decrypt fails, maybe it's a v1-to-v2 migration mid-step
            result[key] = value;
          }
        }
      }

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.includes('Invalid') ||
        message.includes('Unsupported state') ||
        message.includes('authTag') ||
        message.includes('mac check failed')
      ) {
        throw new Error('Secret file corrupted or master key incorrect');
      }
      throw error;
    }
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    await this.ensureDirectoryExists();

    const salt = crypto.randomBytes(32);
    this.encryptionKey = null;
    this.initPromise = null;

    // Atomic Write: Prepare temp file
    const tempPath = `${this.secretFilePath}.tmp`;

    try {
      await fs.writeFile(this.secretFilePath, '', { flag: 'a', mode: 0o600 });
    } catch {
      /* Ignore */
    }

    await this.ensureInitialized(salt, 'v2');
    if (!this.encryptionKey) throw new Error('Init failed');

    // Inner encryption for each secret
    const innerEncryptedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      innerEncryptedSecrets[key] = await this.innerEncrypt(key, value);
    }

    const json = JSON.stringify(innerEncryptedSecrets);
    const wrapper = {
      data: json,
      noise: crypto
        .randomBytes(32 + Math.floor(Math.random() * 128))
        .toString('hex'),
    };

    const encryptedBlob = this.encryptBlob(
      JSON.stringify(wrapper),
      this.encryptionKey,
    );
    const [iv, authTag, ciphertext] = encryptedBlob.split(':');

    const dataToHash = `${salt.toString('hex')}:${iv}:${authTag}:${ciphertext}`;
    const checksum = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex')
      .substring(0, 8);
    const finalData = `v2:${salt.toString('hex')}:${iv}:${authTag}:${ciphertext}:${checksum}`;

    // Atomic Write: Save to temp and rename
    await fs.writeFile(tempPath, finalData, { mode: 0o600 });
    await fs.rename(tempPath, this.secretFilePath);
  }

  async setSecret(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    secrets[key] = value;
    await this.saveSecrets(secrets);
    this.wipeKey();
  }

  async getSecret(key: string): Promise<string | null> {
    const secrets = await this.loadSecrets();
    const result = secrets[key] ?? null;
    this.wipeKey();
    return result;
  }

  async deleteSecret(key: string): Promise<void> {
    const secrets = await this.loadSecrets();
    if (!(key in secrets)) {
      throw new Error(`No secret found for key: ${key}`);
    }
    delete secrets[key];
    await this.saveSecrets(secrets);
    this.wipeKey();
  }

  async listSecrets(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    const keys = Object.keys(secrets);
    this.wipeKey();
    return keys;
  }

  async clearAll(): Promise<void> {
    this.wipeKey();
    try {
      await fs.unlink(this.secretFilePath);
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') return;
      throw error;
    }
  }

  private wipeKey(): void {
    if (this.encryptionKey) {
      this.encryptionKey.fill(0);
      this.encryptionKey = null;
    }
    this.initPromise = null;
  }
}
