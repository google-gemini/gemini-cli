/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as fs from 'fs';

export const GEMINI_DIR = '.gemini';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
const TMP_DIR_NAME = 'tmp';

export class Storage {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
    this.ensureGlobalGeminiDirExists();
    this.ensureGlobalTempDirExists();
    this.ensureProjectTempDirExists();
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getGlobalGeminiDir(): string {
    const homeDir = os.homedir();
    if (!homeDir) {
      // This is a fallback for testing environments where homedir is not defined.
      return path.join(os.tmpdir(), '.gemini');
    }
    const geminiDir = path.join(homeDir, GEMINI_DIR);
    return geminiDir;
  }

  private ensureGlobalGeminiDirExists(): void {
    fs.mkdirSync(this.getGlobalGeminiDir(), { recursive: true });
  }

  getGlobalTempDir(): string {
    const globalGeminiDir = this.getGlobalGeminiDir();
    const tempDir = path.join(globalGeminiDir, TMP_DIR_NAME);
    return tempDir;
  }

  private ensureGlobalTempDirExists(): void {
    fs.mkdirSync(this.getGlobalTempDir(), { recursive: true });
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = this.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  private ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  getOAuthCredsPath(): string {
    const tempDir = this.getGlobalTempDir();
    return path.join(tempDir, 'oauth_creds.json');
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  getInstallationIdPath(): string {
    return path.join(this.getGlobalGeminiDir(), 'installation_id');
  }

  getGoogleAccountsPath(): string {
    return path.join(this.getGlobalGeminiDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(this.getGlobalGeminiDir(), 'history');
    fs.mkdirSync(historyDir, { recursive: true }); // Ensure it exists
    return path.join(historyDir, hash);
  }
}
