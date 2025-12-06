/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { GEMINI_DIR } from '../utils/paths.js';

export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
export const OAUTH_FILE = 'oauth_creds.json';
export const SETTINGS_FILE = 'settings.json';
const TMP_DIR_NAME = 'tmp';
const BIN_DIR_NAME = 'bin';

const { env } = process;

export class Storage {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  static getDefaultGeminiDir(): string {
    return path.join(os.homedir(), GEMINI_DIR);
  }

  // change these functions to use the XDG env var in a different PR
  static getCacheDir(): string {
    return Storage.getDefaultGeminiDir();
  }

  static getConfigDir(): string {
    return Storage.getDefaultGeminiDir();
  }

  static getDataDir(): string {
    return Storage.getDefaultGeminiDir();
  }

  static getStateDir(): string {
    return Storage.getDefaultGeminiDir();
  }

  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getConfigDir(), 'mcp-oauth-tokens.json');
  }

  static getGlobalSettingsPath(): string {
    return path.join(Storage.getConfigDir(), 'settings.json');
  }

  static getInstallationIdPath(): string {
    return path.join(Storage.getCacheDir(), 'installation_id');
  }

  static getGoogleAccountsPath(): string {
    return path.join(Storage.getDataDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return path.join(Storage.getConfigDir(), 'commands');
  }

  static getGlobalMemoryDir(): string {
    return path.join(Storage.getDataDir());
  }

  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getDataDir(), 'memory.md');
  }

  static getUserPoliciesDir(): string {
    return path.join(Storage.getConfigDir(), 'policies');
  }

  static getSystemSettingsPath(): string {
    if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
      return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    }
    if (env['XDG_CONFIG_HOME']) {
      path.join(this.getConfigDir(), SETTINGS_FILE);
    }
    if (os.platform() === 'darwin') {
      return '/Library/Application Support/GeminiCli/settings.json';
    } else if (os.platform() === 'win32') {
      return 'C:\\ProgramData\\gemini-cli\\settings.json';
    } else {
      return '/etc/gemini-cli/settings.json';
    }
  }

  static getSystemPoliciesDir(): string {
    return path.join(path.dirname(Storage.getSystemSettingsPath()), 'policies');
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getStateDir(), TMP_DIR_NAME);
  }

  static getGlobalBinDir(): string {
    return path.join(Storage.getDataDir(), BIN_DIR_NAME);
  }

  static getWorkspaceGeminiDir(targetDir: string = process.cwd()): string {
    return path.join(targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getCacheDir(), OAUTH_FILE);
  }

  static getUserExtensionsDir(): string {
    return path.join(Storage.getConfigDir(), 'extensions');
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getStateDir(), 'history');
    return path.join(historyDir, hash);
  }

  getWorkspaceSettingsPath(): string {
    return path.join(
      Storage.getWorkspaceGeminiDir(this.targetDir),
      'settings.json',
    );
  }

  getProjectCommandsDir(): string {
    return path.join(Storage.getWorkspaceGeminiDir(this.targetDir), 'commands');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getExtensionsDir(): string {
    return path.join(
      Storage.getWorkspaceGeminiDir(this.targetDir),
      'extensions',
    );
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'gemini-extension.json');
  }

  getHistoryFilePath(): string {
    return path.join(Storage.getCacheDir(), 'shell_history');
  }
}
