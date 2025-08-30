/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export const GEMINI_DIR = '.gemini';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
const TMP_DIR_NAME = 'tmp';

export class Storage {
  private readonly targetDir: string;
  private readonly globalGeminiDir: string;


  constructor(targetDir: string, globalGeminiDir: string = Storage.getDefaultGlobalGeminiDir()) {
    this.targetDir = targetDir;
    this.globalGeminiDir = globalGeminiDir;
  }

  getMcpOAuthTokensPath(): string {
    return path.join(this.globalGeminiDir, 'mcp-oauth-tokens.json');
  }

  getGlobalSettingsPath(): string {
    return path.join(this.globalGeminiDir, 'settings.json');
  }

  getInstallationIdPath(): string {
    return path.join(this.globalGeminiDir, 'installation_id');
  }

  getGoogleAccountsPath(): string {
    return path.join(this.globalGeminiDir, GOOGLE_ACCOUNTS_FILENAME);
  }

  getUserCommandsDir(): string {
    return path.join(this.globalGeminiDir, 'commands');
  }

  getOAuthCredsPath(): string {
    return path.join(this.globalGeminiDir, 'oauth_creds.json');
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = this.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(this.globalGeminiDir, 'history');
    return path.join(historyDir, hash);
  }

  getWorkspaceSettingsPath(): string {
    return path.join(this.getGeminiDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return path.join(this.getGeminiDir(), 'commands');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getExtensionsDir(): string {
    return path.join(this.getGeminiDir(), 'extensions');
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'gemini-extension.json');
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  private getGlobalTempDir(): string {
    return path.join(this.globalGeminiDir, TMP_DIR_NAME);
  }

  static getDefaultGlobalGeminiDir(): string {
    const homeDir = os.homedir();
    if (!homeDir) {
      return path.join(os.tmpdir(), '.gemini');
    }
    return path.join(homeDir, GEMINI_DIR);
  }
}
