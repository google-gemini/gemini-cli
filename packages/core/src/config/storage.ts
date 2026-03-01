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
  normalizePath,
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

  /**
   * Checks if the current workspace storage location is the same as the global/user storage location.
   * This handles symlinks and platform-specific path normalization.
   */
  isWorkspaceHomeDir(): boolean {
    return (
      normalizePath(resolveToRealPath(this.targetDir)) ===
      normalizePath(resolveToRealPath(homedir()))
    );
  }

  getAgentsDir(): string {
    return path.join(this.targetDir, AGENTS_DIR_NAME);
  }

  getWorkspaceTempDir(): string {
    const identifier = this.getProjectIdentifier();
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, identifier);
  }

  /** @deprecated Use getWorkspaceTempDir instead */
  getProjectTempDir(): string {
    return this.getWorkspaceTempDir();
  }

  getWorkspacePoliciesDir(): string {
    return path.join(this.getGeminiDir(), 'policies');
  }

  getAutoSavedPolicyPath(): string {
    return path.join(Storage.getUserPoliciesDir(), AUTO_SAVED_POLICY_FILENAME);
  }

  ensureWorkspaceTempDirExists(): void {
    fs.mkdirSync(this.getWorkspaceTempDir(), { recursive: true });
  }

  /** @deprecated Use ensureWorkspaceTempDirExists instead */
  ensureProjectTempDirExists(): void {
    this.ensureWorkspaceTempDirExists();
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), OAUTH_FILE);
  }

  getWorkspaceRoot(): string {
    return this.targetDir;
  }

  /** @deprecated Use getWorkspaceRoot instead */
  getProjectRoot(): string {
    return this.getWorkspaceRoot();
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

  getWorkspaceCommandsDir(): string {
    return path.join(this.getGeminiDir(), 'commands');
  }

  /** @deprecated Use getWorkspaceCommandsDir instead */
  getProjectCommandsDir(): string {
    return this.getWorkspaceCommandsDir();
  }

  getWorkspaceSkillsDir(): string {
    return path.join(this.getGeminiDir(), 'skills');
  }

  /** @deprecated Use getWorkspaceSkillsDir instead */
  getProjectSkillsDir(): string {
    return this.getWorkspaceSkillsDir();
  }

  getWorkspaceAgentSkillsDir(): string {
    return path.join(this.getAgentsDir(), 'skills');
  }

  /** @deprecated Use getWorkspaceAgentSkillsDir instead */
  getProjectAgentSkillsDir(): string {
    return this.getWorkspaceAgentSkillsDir();
  }

  getWorkspaceAgentsDir(): string {
    return path.join(this.getGeminiDir(), 'agents');
  }

  /** @deprecated Use getWorkspaceAgentsDir instead */
  getProjectAgentsDir(): string {
    return this.getWorkspaceAgentsDir();
  }

  getWorkspaceTempCheckpointsDir(): string {
    return path.join(this.getWorkspaceTempDir(), 'checkpoints');
  }

  /** @deprecated Use getWorkspaceTempCheckpointsDir instead */
  getProjectTempCheckpointsDir(): string {
    return this.getWorkspaceTempCheckpointsDir();
  }

  getWorkspaceTempLogsDir(): string {
    return path.join(this.getWorkspaceTempDir(), 'logs');
  }

  /** @deprecated Use getWorkspaceTempLogsDir instead */
  getProjectTempLogsDir(): string {
    return this.getWorkspaceTempLogsDir();
  }

  getWorkspaceTempPlansDir(): string {
    if (this.sessionId) {
      return path.join(this.getWorkspaceTempDir(), this.sessionId, 'plans');
    }
    return path.join(this.getWorkspaceTempDir(), 'plans');
  }

  /** @deprecated Use getWorkspaceTempPlansDir instead */
  getProjectTempPlansDir(): string {
    return this.getWorkspaceTempPlansDir();
  }

  getWorkspaceTempTrackerDir(): string {
    return path.join(this.getWorkspaceTempDir(), 'tracker');
  }

  /** @deprecated Use getWorkspaceTempTrackerDir instead */
  getProjectTempTrackerDir(): string {
    return this.getWorkspaceTempTrackerDir();
  }

  getPlansDir(): string {
    if (this.customPlansDir) {
      const resolvedPath = path.resolve(
        this.getWorkspaceRoot(),
        this.customPlansDir,
      );
      const realWorkspaceRoot = resolveToRealPath(this.getWorkspaceRoot());
      const realResolvedPath = resolveToRealPath(resolvedPath);

      if (!isSubpath(realWorkspaceRoot, realResolvedPath)) {
        throw new Error(
          `Custom plans directory '${this.customPlansDir}' resolves to '${realResolvedPath}', which is outside the workspace root '${realWorkspaceRoot}'.`,
        );
      }

      return resolvedPath;
    }
    return this.getWorkspaceTempPlansDir();
  }

  getWorkspaceTempTasksDir(): string {
    if (this.sessionId) {
      return path.join(this.getWorkspaceTempDir(), this.sessionId, 'tasks');
    }
    return path.join(this.getWorkspaceTempDir(), 'tasks');
  }

  /** @deprecated Use getWorkspaceTempTasksDir instead */
  getProjectTempTasksDir(): string {
    return this.getWorkspaceTempTasksDir();
  }

  async listWorkspaceChatFiles(): Promise<
    Array<{ filePath: string; lastUpdated: string }>
  > {
    const chatsDir = path.join(this.getWorkspaceTempDir(), 'chats');
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

  /** @deprecated Use listWorkspaceChatFiles instead */
  async listProjectChatFiles(): Promise<
    Array<{ filePath: string; lastUpdated: string }>
  > {
    return this.listWorkspaceChatFiles();
  }

  async loadWorkspaceTempFile<T>(filePath: string): Promise<T | null> {
    const absolutePath = path.join(this.getWorkspaceTempDir(), filePath);
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

  /** @deprecated Use loadWorkspaceTempFile instead */
  async loadProjectTempFile<T>(filePath: string): Promise<T | null> {
    return this.loadWorkspaceTempFile(filePath);
  }

  getExtensionsDir(): string {
    return path.join(this.getGeminiDir(), 'extensions');
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'gemini-extension.json');
  }

  getHistoryFilePath(): string {
    return path.join(this.getWorkspaceTempDir(), 'shell_history');
  }
}
