/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Secure credential encryption utilities.
 *
 * SECURITY NOTE: This module provides encryption for sensitive credentials
 * stored on disk. While not perfect (keys stored on same machine), it provides
 * defense-in-depth protection against casual credential theft.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * Gets or creates a machine-specific encryption key.
 *
 * WARNING: This stores the key on the local filesystem. While this provides
 * some protection against casual credential theft, it is NOT secure against
 * a determined attacker with local access.
 *
 * For production use, consider:
 * - OS-specific keychains (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
 * - Hardware security modules (HSM)
 * - External key management services (KMS)
 */
function getEncryptionKey(keyPath: string): Buffer {
  try {
    // Try to read existing key
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath);
      if (key.length === KEY_LENGTH) {
        return key;
      }
    }
  } catch (error) {
    // Fall through to generate new key
  }

  // Generate new key
  const key = crypto.randomBytes(KEY_LENGTH);

  try {
    // Ensure directory exists
    const keyDir = path.dirname(keyPath);
    fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });

    // Write key with restricted permissions
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
  } catch (error) {
    console.warn(
      'Warning: Could not save encryption key to disk. ' +
      'Credentials will not persist across restarts.',
    );
  }

  return key;
}

/**
 * Encrypts sensitive data using AES-256-GCM.
 *
 * @param plaintext Data to encrypt
 * @param keyPath Path to store/retrieve encryption key
 * @returns Encrypted data in format: salt:iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string, keyPath: string): string {
  const key = getEncryptionKey(keyPath);

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key using PBKDF2 with random salt for additional security
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

  // Encrypt
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Return combined format: salt:iv:authTag:ciphertext
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext,
  ].join(':');
}

/**
 * Decrypts data encrypted with encrypt().
 *
 * @param encrypted Encrypted data in format: salt:iv:authTag:ciphertext
 * @param keyPath Path to retrieve encryption key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or data is tampered
 */
export function decrypt(encrypted: string, keyPath: string): string {
  const key = getEncryptionKey(keyPath);

  // Split components
  const parts = encrypted.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltB64, ivB64, authTagB64, ciphertext] = parts;

  // Decode components
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  // Derive key using same parameters as encryption
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Checks if data appears to be encrypted by this module.
 *
 * @param data Data to check
 * @returns True if data looks encrypted
 */
export function isEncrypted(data: string): boolean {
  const parts = data.split(':');
  if (parts.length !== 4) {
    return false;
  }

  // Check that each part is valid base64
  try {
    for (const part of parts) {
      Buffer.from(part, 'base64');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the default encryption key path for credentials.
 */
export function getDefaultKeyPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.gemini', '.encryption_key');
}

/**
 * Securely wipes a file by overwriting with random data before deletion.
 *
 * @param filePath Path to file to wipe
 */
export function secureWipe(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const stats = fs.statSync(filePath);
    const size = stats.size;

    // Overwrite with random data multiple times
    for (let i = 0; i < 3; i++) {
      const randomData = crypto.randomBytes(size);
      fs.writeFileSync(filePath, randomData);
      fs.fsyncSync(fs.openSync(filePath, 'r+'));
    }

    // Finally delete
    fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`Warning: Could not securely wipe file: ${filePath}`);
  }
}
