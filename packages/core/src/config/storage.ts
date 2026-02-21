/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {
  GEMINI_DIR,
  homedir,
  GOOGLE_ACCOUNTS_FILENAME,
  isSubpath,
  resolveToRealPath,
} from '../utils/paths.js';
import { ProjectRegistry } from './projectRegistry.js';
import { StorageMigration } from './storageMigration.js';

export const OAUTH_FILE = 'oauth_creds.json';
const TMP_DIR_NAME = 'tmp';
const BIN_DIR_NAME = 'bin';
const AGENTS_DIR_NAME = '.agents';

export const AUTO_SAVED_POLICY_FILENAME = 'auto-saved.toml';

export class Storage {
  private readonly targetDir: string;
  private readonly sessionId: string | undefined;
  private projectIdentifier: string | undefined;
  private initPromise: Promise<void> | undefined;
  private customPlansDir: string | undefined;

  constructor(targetDir: string, sessionId?: string) {
    this.targetDir = targetDir;
    this.sessionId = sessionId;
  }

  setCustomPlansDir(dir: string | undefined): void {
    this.customPlansDir = dir;
  }

  static getGlobalGeminiDir(): string {
    const homeDir = homedir();
    if (!homeDir) {
      return path.join(os.tmpdir(), GEMINI_DIR);
    }
    return path.join(homeDir, GEMINI_DIR);
  }

  static getGlobalAgentsDir(): string {
    const homeDir = homedir();
    if (!homeDir) {
      return '';
    }
    return path.join(homeDir, AGENTS_DIR_NAME);
  }

  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'mcp-oauth-tokens.json');
  }

  static getGlobalSettingsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'settings.json');
  }

  static getInstallationIdPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'installation_id');
  }

  static getGoogleAccountsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'commands');
  }

  static getUserSkillsDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'skills');
  }

  static getUserAgentSkillsDir(): string {
    return path.join(Storage.getGlobalAgentsDir(), 'skills');
  }

  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'memory.md');
  }

  static getUserPoliciesDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'policies');
  }

  static getUserAgentsDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'agents');
  }

  static getAcknowledgedAgentsPath(): string {
    return path.join(
      Storage.getGlobalGeminiDir(),
      'acknowledgments',
      'agents.json',
    );
  }

  static getPolicyIntegrityStoragePath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'policy_integrity.json');
  }

  private static getSystemConfigDir(): string {
    if (os.platform() === 'darwin') {
      return '/Library/Application Support/GeminiCli';
    } else if (os.platform() === 'win32') {
      return 'C:\\ProgramData\\gemini-cli';
    } else {
      return '/etc/gemini-cli';
    }
  }

  static getSystemSettingsPath(): string {
    if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
      return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    }
    return path.join(Storage.getSystemConfigDir(), 'settings.json');
  }

  static getSystemPoliciesDir(): string {
    return path.join(Storage.getSystemConfigDir(), 'policies');
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), TMP_DIR_NAME);
  }

  static getGlobalBinDir(): string {
    return path.join(Storage.getGlobalTempDir(), BIN_DIR_NAME);
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getAgentsDir(): string {
    return path.join(this.targetDir, AGENTS_DIR_NAME);
  }

  getProjectTempDir(): string {
    const identifier = this.getProjectIdentifier();
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, identifier);
  }

  getWorkspacePoliciesDir(): string {
    return path.join(this.getGeminiDir(), 'policies');
  }

  getAutoSavedPolicyPath(): string {
    return path.join(
      this.getWorkspacePoliciesDir(),
      AUTO_SAVED_POLICY_FILENAME,
    );
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), OAUTH_FILE);
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  private getProjectIdentifier(): string {
    if (!this.projectIdentifier) {
      throw new Error('Storage must be initialized before use');
    }
    return this.projectIdentifier;
  }

  /**
   * Initializes storage by setting up the project registry and performing migrations.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (this.projectIdentifier) {
        return;
      }

      const registryPath = path.join(
        Storage.getGlobalGeminiDir(),
        'projects.json',
      );
      const registry = new ProjectRegistry(registryPath, [
        Storage.getGlobalTempDir(),
        path.join(Storage.getGlobalGeminiDir(), 'history'),
      ]);
      await registry.initialize();

      this.projectIdentifier = await registry.getShortId(this.getProjectRoot());
      await this.performMigration();
    })();

    return this.initPromise;
  }

  /**
   * Performs migration of legacy hash-based directories to the new slug-based format.
   * This is called internally by initialize().
   */
  private async performMigration(): Promise<void> {
    const shortId = this.getProjectIdentifier();
    const oldHash = this.getFilePathHash(this.getProjectRoot());

    // Migrate Temp Dir
    const newTempDir = path.join(Storage.getGlobalTempDir(), shortId);
    const oldTempDir = path.join(Storage.getGlobalTempDir(), oldHash);
    await StorageMigration.migrateDirectory(oldTempDir, newTempDir);

    // Migrate History Dir
    const historyDir = path.join(Storage.getGlobalGeminiDir(), 'history');
    const newHistoryDir = path.join(historyDir, shortId);
    const oldHistoryDir = path.join(historyDir, oldHash);
    await StorageMigration.migrateDirectory(oldHistoryDir, newHistoryDir);
  }

  getHistoryDir(): string {
    const identifier = this.getProjectIdentifier();
    const historyDir = path.join(Storage.getGlobalGeminiDir(), 'history');
    return path.join(historyDir, identifier);
  }

  getWorkspaceSettingsPath(): string {
    return path.join(this.getGeminiDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return path.join(this.getGeminiDir(), 'commands');
  }

  getProjectSkillsDir(): string {
    return path.join(this.getGeminiDir(), 'skills');
  }

  getProjectAgentSkillsDir(): string {
    return path.join(this.getAgentsDir(), 'skills');
  }

  getProjectAgentsDir(): string {
    return path.join(this.getGeminiDir(), 'agents');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getProjectTempLogsDir(): string {
    return path.join(this.getProjectTempDir(), 'logs');
  }

  getProjectTempPlansDir(): string {
    if (this.sessionId) {
      return path.join(this.getProjectTempDir(), this.sessionId, 'plans');
    }
    return path.join(this.getProjectTempDir(), 'plans');
  }

  getPlansDir(): string {
    if (this.customPlansDir) {
      const resolvedPath = path.resolve(
        this.getProjectRoot(),
        this.customPlansDir,
      );
      const realProjectRoot = resolveToRealPath(this.getProjectRoot());
      const realResolvedPath = resolveToRealPath(resolvedPath);

      if (!isSubpath(realProjectRoot, realResolvedPath)) {
        throw new Error(
          `Custom plans directory '${this.customPlansDir}' resolves to '${realResolvedPath}', which is outside the project root '${realProjectRoot}'.`,
        );
      }

      return resolvedPath;
    }
    return this.getProjectTempPlansDir();
  }

  getProjectTempTasksDir(): string {
    if (this.sessionId) {
      return path.join(this.getProjectTempDir(), this.sessionId, 'tasks');
    }
    return path.join(this.getProjectTempDir(), 'tasks');
  }

  async listProjectChatFiles(): Promise<
    Array<{ filePath: string; lastUpdated: string }>
  > {
    const chatsDir = path.join(this.getProjectTempDir(), 'chats');
    try {
      const files = await fs.promises.readdir(chatsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const sessions = await Promise.all(
        jsonFiles.map(async (file) => {
          const absolutePath = path.join(chatsDir, file);
          const stats = await fs.promises.stat(absolutePath);
          return {
            filePath: path.join('chats', file),
            lastUpdated: stats.mtime.toISOString(),
            mtimeMs: stats.mtimeMs,
          };
        }),
      );

      return sessions
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .map(({ filePath, lastUpdated }) => ({ filePath, lastUpdated }));
    } catch (e) {
      // If directory doesn't exist, return empty
      if (
        e instanceof Error &&
        'code' in e &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (e as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw e;
    }
  }

  async loadProjectTempFile<T>(filePath: string): Promise<T | null> {
    const absolutePath = path.join(this.getProjectTempDir(), filePath);
    try {
      const content = await fs.promises.readFile(absolutePath, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(content) as T;
    } catch (e) {
      // If file doesn't exist, return null
      if (
        e instanceof Error &&
        'code' in e &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (e as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      throw e;
    }
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
}
