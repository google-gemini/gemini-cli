/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';

export class InstallationManager {
  private getInstallationIdPath(): string {
    return Storage.getInstallationIdPath();
  }

  private readInstallationIdFromFile(): string | null {
    const installationIdFile = this.getInstallationIdPath();
    if (fs.existsSync(installationIdFile)) {
      const installationid = fs
        .readFileSync(installationIdFile, 'utf-8')
        .trim();
      return installationid || null;
    }
    return null;
  }

  private writeInstallationIdToFile(installationId: string) {
    const installationIdFile = this.getInstallationIdPath();
    const dir = path.dirname(installationIdFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(installationIdFile, installationId, 'utf-8');
  }

  /**
   * Retrieves the installation ID from a file, creating it if it doesn't exist.
   * This ID is used for unique user installation tracking.
   * @returns A UUID string for the user.
   */
  getInstallationId(): string {
    try {
      let installationId = this.readInstallationIdFromFile();

      if (!installationId) {
        installationId = randomUUID();
        this.writeInstallationIdToFile(installationId);
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
}

/**
 * Retrieves the installation ID from a file, creating it if it doesn't exist.
 * This ID is used for unique user installation tracking.
 * @returns A UUID string for the user, or undefined if unable to access/create the ID.
 */
export function getInstallationId(): string | undefined {
  try {
    const homeDir = os.homedir() ?? '';
    const geminiDir = path.join(homeDir, '.gemini');
    const installationIdFile = path.join(geminiDir, 'installation_id');

    // Ensure directory exists
    if (!fs.existsSync(geminiDir)) {
      fs.mkdirSync(geminiDir, { recursive: true });
    }

    // Read existing ID or create new one
    let installationId: string | null = null;
    if (fs.existsSync(installationIdFile)) {
      const id = fs.readFileSync(installationIdFile, 'utf-8').trim();
      installationId = id || null;
    }

    if (!installationId) {
      installationId = randomUUID();
      fs.writeFileSync(installationIdFile, installationId, 'utf-8');
    }

    return installationId;
  } catch (error) {
    console.error(
      'Error accessing installation ID file:',
      error,
    );
    return undefined;
  }
}
