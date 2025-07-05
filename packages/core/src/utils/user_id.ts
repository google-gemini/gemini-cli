/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { GEMINI_DIR } from './paths.js';

const homeDir = os.homedir() ?? '';
const geminiDir = path.join(homeDir, GEMINI_DIR);
const installationIdFile = path.join(geminiDir, 'installation_id');

function ensureGeminiDirExists() {
  if (!fs.existsSync(geminiDir)) {
    fs.mkdirSync(geminiDir, { recursive: true });
  }
}

function readInstallationIdFromFile(): string | null {
  if (fs.existsSync(installationIdFile)) {
    const installationid = fs.readFileSync(installationIdFile, 'utf-8').trim();
    return installationid || null;
  }
  return null;
}

function writeInstallationIdToFile(installationId: string) {
  fs.writeFileSync(installationIdFile, installationId, 'utf-8');
}

/**
 * Retrieves the installation ID from a file, creating it if it doesn't exist.
 * This ID is used for unique user installation tracking.
 * @returns A UUID string for the user.
 */
export function getInstallationId(): string {
  try {
    ensureGeminiDirExists();
    let installationId = readInstallationIdFromFile();

    if (!installationId) {
      installationId = randomUUID();
      writeInstallationIdToFile(installationId);
    }

    return installationId;
  } catch (error) {
    console.error(
      'Error accessing installation ID file, generating ephemeral ID:',
      error,
    );
    return '123456789';
  }
}

/**
 * Retrieves the obfuscated Google Account ID for the currently authenticated user.
 * When OAuth is available, returns the user's cached Google Account ID. Otherwise, returns the installation ID.
 * @returns A string ID for the user (Google Account ID if available, otherwise installation ID).
 */
export async function getGoogleAccountId(): Promise<string> {
  // Try to get cached Google Account ID first
  try {
    // Dynamic import to avoid circular dependencies
    const { getCachedGoogleAccountId } = await import(
      '../code_assist/oauth2.js'
    );
    const googleAccountId = getCachedGoogleAccountId();
    if (googleAccountId) {
      return googleAccountId;
    }
  } catch (error) {
    // If there's any error accessing Google Account ID, just return empty string
    console.debug('Could not get cached Google Account ID:', error);
  }

  return '';
}
