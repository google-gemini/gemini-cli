/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

/**
 * Ensures secure permissions on sensitive credential files
 * This prevents unauthorized access to stored credentials
 */
export async function secureCredentialsFile(): Promise<void> {
  const geminiDir = path.join(homedir(), '.gemini');
  const credsPath = path.join(geminiDir, 'oauth_creds.json');

  try {
    // Ensure the directory exists with secure permissions
    try {
      await fs.access(geminiDir);
      await fs.chmod(geminiDir, 0o700);
    } catch (_error) {
      // Directory doesn't exist, create it securely
      await fs.mkdir(geminiDir, { mode: 0o700, recursive: true });
    }

    // Check if credentials file exists
    try {
      await fs.access(credsPath);
    } catch (_error) {
      // File doesn't exist, nothing to secure
      return;
    }

    // Get current permissions
    const stats = await fs.stat(credsPath);
    const currentMode = stats.mode & 0o777;

    // Fix permissions if too permissive (should be 0o600)
    if (currentMode !== 0o600) {
      console.warn(`[SECURITY] Securing credential file permissions`);
      await fs.chmod(credsPath, 0o600);
    }
  } catch (error) {
    // Log but don't throw - this shouldn't break the application
    console.debug('[SECURITY] Could not secure credential file:', error);
  }
}

/**
 * Validates that sensitive files have secure permissions
 */
export async function validateCredentialSecurity(): Promise<boolean> {
  const credsPath = path.join(homedir(), '.gemini', 'oauth_creds.json');

  try {
    const stats = await fs.stat(credsPath);
    const mode = stats.mode & 0o777;
    return mode === 0o600;
  } catch (_error) {
    // File doesn't exist or can't be accessed
    return true;
  }
}
