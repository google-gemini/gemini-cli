/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { FileKeychain } from './fileKeychain.js';

describe('AES-GCM Tag Length Verification', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for test isolation
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-keychain-'));
    vi.stubEnv('GEMINI_CLI_HOME', tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should use a secure 128-bit (16-byte) AES-GCM authentication tag and standard 12-byte IV', async () => {
    const keychain = new FileKeychain();
    const service = 'test-service';
    const account = 'test-account';
    const password = 'secure-password-123';

    // 1. Save credentials to trigger encryption and file write
    await keychain.setPassword(service, account, password);

    // 2. Read the raw encrypted file from disk
    const credentialsFilePath = path.join(tempDir, '.gemini', 'gemini-credentials.json');
    const rawEncryptedData = await fs.readFile(credentialsFilePath, 'utf-8');

    // 3. Parse the encrypted data format (iv:authTag:encrypted)
    const parts = rawEncryptedData.split(':');
    expect(parts).toHaveLength(3);

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];

    // 4. Verify the lengths of the components
    const ivBuffer = Buffer.from(ivHex, 'hex');
    const authTagBuffer = Buffer.from(authTagHex, 'hex');

    // IV should be exactly 12 bytes (96 bits) by default
    expect(ivBuffer.length).toBe(12);
    expect(ivHex.length).toBe(24);

    // Authentication Tag should be exactly 16 bytes (128 bits)
    expect(authTagBuffer.length).toBe(16);
    expect(authTagHex.length).toBe(32); // 32 hex characters

    // Assert that the tag is NOT truncated to 4 bytes (32 bits)
    expect(authTagBuffer.length).not.toBe(4);
    expect(authTagHex.length).not.toBe(8); // 8 hex characters

    // 5. Verify that decryption works correctly with the 16-byte tag
    const decryptedPassword = await keychain.getPassword(service, account);
    expect(decryptedPassword).toBe(password);
  });

  it('should support both 12-byte and 16-byte IVs for backward compatibility', async () => {
    const keychain = new FileKeychain();
    const service = 'test-service';
    const account = 'test-account';
    const password = 'secure-password-123';

    // 1. Save credentials to trigger encryption and file write (generates 12-byte IV)
    await keychain.setPassword(service, account, password);

    // 2. Verify 12-byte IV decryption works
    let decryptedPassword = await keychain.getPassword(service, account);
    expect(decryptedPassword).toBe(password);

    // 3. Manually simulate a legacy 16-byte IV credentials file
    const credentialsFilePath = path.join(tempDir, '.gemini', 'gemini-credentials.json');
    const legacyIv = crypto.randomBytes(16);
    const encryptionKey = (keychain as any).encryptionKey;
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, legacyIv, {
      authTagLength: 16,
    });

    let encrypted = cipher.update(JSON.stringify({ [service]: { [account]: password } }), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const legacyPayload = legacyIv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    await fs.writeFile(credentialsFilePath, legacyPayload, 'utf-8');

    // 4. Verify 16-byte IV decryption works successfully (backward compatibility)
    decryptedPassword = await keychain.getPassword(service, account);
    expect(decryptedPassword).toBe(password);
  });

  it('should reject decryption of a credentials file with a truncated tag', async () => {
    const keychain = new FileKeychain();
    const service = 'test-service';
    const account = 'test-account';
    const password = 'secure-password-123';

    // 1. Save credentials to trigger encryption and file write
    await keychain.setPassword(service, account, password);

    // 2. Read the raw encrypted file from disk
    const credentialsFilePath = path.join(tempDir, '.gemini', 'gemini-credentials.json');
    const rawEncryptedData = await fs.readFile(credentialsFilePath, 'utf-8');

    // 3. Parse the encrypted data format (iv:authTag:encrypted)
    const parts = rawEncryptedData.split(':');
    expect(parts).toHaveLength(3);

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];

    // 4. Create a truncated 4-byte tag (8 hex characters)
    const truncatedTagHex = authTagHex.substring(0, 8);
    const truncatedEncryptedData = `${ivHex}:${truncatedTagHex}:${encryptedHex}`;

    // 5. Overwrite the credentials file with the truncated-tag payload
    await fs.writeFile(credentialsFilePath, truncatedEncryptedData, 'utf-8');

    // 6. Attempt to retrieve the password and verify it throws a clear, handled validation error
    await expect(keychain.getPassword(service, account)).rejects.toThrow(
      'Corrupted credentials file detected'
    );
  });

  it('should reject decryption of a credentials file with a truncated IV', async () => {
    const keychain = new FileKeychain();
    const service = 'test-service';
    const account = 'test-account';
    const password = 'secure-password-123';

    // 1. Save credentials to trigger encryption and file write
    await keychain.setPassword(service, account, password);

    // 2. Read the raw encrypted file from disk
    const credentialsFilePath = path.join(tempDir, '.gemini', 'gemini-credentials.json');
    const rawEncryptedData = await fs.readFile(credentialsFilePath, 'utf-8');

    // 3. Parse the encrypted data format (iv:authTag:encrypted)
    const parts = rawEncryptedData.split(':');
    expect(parts).toHaveLength(3);

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];

    // 4. Create a truncated 4-byte IV (8 hex characters)
    const truncatedIvHex = ivHex.substring(0, 8);
    const truncatedEncryptedData = `${truncatedIvHex}:${authTagHex}:${encryptedHex}`;

    // 5. Overwrite the credentials file with the truncated-IV payload
    await fs.writeFile(credentialsFilePath, truncatedEncryptedData, 'utf-8');

    // 6. Attempt to retrieve the password and verify it throws a clear, handled validation error
    await expect(keychain.getPassword(service, account)).rejects.toThrow(
      'Corrupted credentials file detected'
    );
  });
});
