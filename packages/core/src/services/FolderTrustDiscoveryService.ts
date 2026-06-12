/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import stripJsonComments from 'strip-json-comments';
import { GEMINI_DIR, isSubpath } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import { isNodeError } from '../utils/errors.js';

export interface FolderDiscoveryResults {
  commands: string[];
  mcps: string[];
  hooks: string[];
  skills: string[];
  agents: string[];
  settings: string[];
  securityWarnings: string[];
  discoveryErrors: string[];
}

const EXTENSION_CONFIG_FILENAME = 'gemini-extension.json';

interface ExtensionDiscoveryConfig {
  hooksDir?: string;
  skillsDir?: string;
}

/**
 * A safe, read-only service to discover local configurations in a folder
 * before it is trusted.
 */
export class FolderTrustDiscoveryService {
  /**
   * Discovers configurations in the given workspace directory.
   * @param workspaceDir The directory to scan.
   * @returns A summary of discovered configurations.
   */
  static async discover(workspaceDir: string): Promise<FolderDiscoveryResults> {
    const results: FolderDiscoveryResults = {
      commands: [],
      mcps: [],
      hooks: [],
      skills: [],
      agents: [],
      settings: [],
      securityWarnings: [],
      discoveryErrors: [],
    };

    const geminiDir = path.join(workspaceDir, GEMINI_DIR);
    const hasGeminiDir = await this.exists(geminiDir);
    const extensionConfig = await this.loadExtensionDiscoveryConfig(
      workspaceDir,
      results,
    );

    if (!hasGeminiDir && !extensionConfig) {
      return results;
    }

    const discoveryTasks: Array<Promise<void>> = [];
    if (hasGeminiDir) {
      discoveryTasks.push(
        this.discoverCommands(geminiDir, results),
        this.discoverSkills(geminiDir, results),
        this.discoverAgents(geminiDir, results),
        this.discoverSettings(geminiDir, results),
      );
    }

    if (extensionConfig) {
      discoveryTasks.push(
        this.discoverExtensionSkills(workspaceDir, extensionConfig, results),
        this.discoverExtensionHooks(workspaceDir, extensionConfig, results),
      );
    }

    await Promise.all(discoveryTasks);

    return results;
  }

  private static async discoverCommands(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const commandsDir = path.join(geminiDir, 'commands');
    if (await this.exists(commandsDir)) {
      try {
        const files = await fs.readdir(commandsDir, { recursive: true });
        results.commands = files
          .filter((f) => f.endsWith('.toml'))
          .map((f) => path.basename(f, '.toml'));
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover commands: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private static async discoverSkills(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const skillsDir = path.join(geminiDir, 'skills');
    await this.discoverSkillsInDirectory(skillsDir, results);
  }

  private static async discoverSkillsInDirectory(
    skillsDir: string,
    results: FolderDiscoveryResults,
  ) {
    if (await this.exists(skillsDir)) {
      try {
        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
            if (await this.exists(skillMdPath)) {
              results.skills.push(entry.name);
            }
          }
        }
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover skills: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private static async discoverAgents(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const agentsDir = path.join(geminiDir, 'agents');
    if (await this.exists(agentsDir)) {
      try {
        const entries = await fs.readdir(agentsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.isFile() &&
            entry.name.endsWith('.md') &&
            !entry.name.startsWith('_')
          ) {
            results.agents.push(path.basename(entry.name, '.md'));
          }
        }
        if (results.agents.length > 0) {
          results.securityWarnings.push('This project contains custom agents.');
        }
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover agents: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private static async discoverSettings(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const settingsPath = path.join(geminiDir, 'settings.json');
    if (!(await this.exists(settingsPath))) return;

    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(stripJsonComments(content)) as unknown;

      if (!this.isRecord(settings)) {
        debugLogger.debug('Settings must be a JSON object');
        return;
      }

      results.settings = Object.keys(settings).filter(
        (key) => !['mcpServers', 'hooks', '$schema'].includes(key),
      );

      results.securityWarnings.push(...this.collectSecurityWarnings(settings));

      const mcpServers = settings['mcpServers'];
      if (this.isRecord(mcpServers)) {
        results.mcps = Object.keys(mcpServers);
      }

      const hooksConfig = settings['hooks'];
      if (this.isRecord(hooksConfig)) {
        const hooks = new Set<string>();
        for (const event of Object.values(hooksConfig)) {
          if (!Array.isArray(event)) continue;
          for (const hook of event) {
            // eslint-disable-next-line no-restricted-syntax
            if (this.isRecord(hook) && typeof hook['command'] === 'string') {
              hooks.add(hook['command']);
            }
          }
        }
        this.addUniqueItems(results.hooks, Array.from(hooks));
      }
    } catch (e) {
      results.discoveryErrors.push(
        `Failed to discover settings: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private static async discoverExtensionSkills(
    extensionDir: string,
    config: ExtensionDiscoveryConfig,
    results: FolderDiscoveryResults,
  ) {
    const skillsDir = this.resolveExtensionDir(
      extensionDir,
      config.skillsDir,
      'skills',
      'skills',
      results,
    );
    if (!skillsDir) return;
    await this.discoverSkillsInDirectory(skillsDir, results);
  }

  private static async discoverExtensionHooks(
    extensionDir: string,
    config: ExtensionDiscoveryConfig,
    results: FolderDiscoveryResults,
  ) {
    const hooksDir = this.resolveExtensionDir(
      extensionDir,
      config.hooksDir,
      'hooks',
      'hooks',
      results,
    );
    if (!hooksDir) return;

    const hooksFilePath = path.join(hooksDir, 'hooks.json');
    if (!(await this.exists(hooksFilePath))) return;

    try {
      const content = await fs.readFile(hooksFilePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;

      if (!this.isRecord(parsed) || !this.isRecord(parsed['hooks'])) {
        results.discoveryErrors.push(
          'Failed to discover extension hooks: Invalid hooks configuration.',
        );
        return;
      }

      const commands = new Set<string>();
      for (const definitions of Object.values(parsed['hooks'])) {
        if (!Array.isArray(definitions)) continue;
        for (const definition of definitions) {
          if (!this.isRecord(definition)) continue;
          const hooks = definition['hooks'];
          if (!Array.isArray(hooks)) continue;
          for (const hook of hooks) {
            if (!this.isRecord(hook)) continue;
            const command = this.getStringProperty(hook, 'command');
            if (command) {
              commands.add(command);
            }
          }
        }
      }

      if (commands.size > 0) {
        this.addUniqueItems(results.hooks, Array.from(commands));
      } else {
        this.addUniqueItems(results.hooks, [path.basename(hooksFilePath)]);
      }
    } catch (e) {
      results.discoveryErrors.push(
        `Failed to discover extension hooks: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private static collectSecurityWarnings(
    settings: Record<string, unknown>,
  ): string[] {
    const warnings: string[] = [];

    const tools = this.isRecord(settings['tools'])
      ? settings['tools']
      : undefined;

    const security = this.isRecord(settings['security'])
      ? settings['security']
      : undefined;

    const folderTrust =
      security && this.isRecord(security['folderTrust'])
        ? security['folderTrust']
        : undefined;

    const allowedTools = tools?.['allowed'];

    const checks = [
      {
        condition: Array.isArray(allowedTools) && allowedTools.length > 0,
        message: 'This project auto-approves certain tools (tools.allowed).',
      },
      {
        condition: folderTrust?.['enabled'] === false,
        message:
          'This project attempts to disable folder trust (security.folderTrust.enabled).',
      },
      {
        condition: tools?.['sandbox'] === false,
        message: 'This project disables the security sandbox (tools.sandbox).',
      },
    ];

    for (const check of checks) {
      if (check.condition) warnings.push(check.message);
    }

    return warnings;
  }

  private static async loadExtensionDiscoveryConfig(
    extensionDir: string,
    results: FolderDiscoveryResults,
  ): Promise<ExtensionDiscoveryConfig | null> {
    const configPath = path.join(extensionDir, EXTENSION_CONFIG_FILENAME);
    if (!(await this.exists(configPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content)) as unknown;
      if (!this.isRecord(parsed)) {
        results.discoveryErrors.push(
          'Failed to discover extension config: Manifest must be a JSON object.',
        );
        return null;
      }

      return {
        hooksDir: this.getStringProperty(parsed, 'hooksDir'),
        skillsDir: this.getStringProperty(parsed, 'skillsDir'),
      };
    } catch (e) {
      results.discoveryErrors.push(
        `Failed to discover extension config: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  private static resolveExtensionDir(
    extensionDir: string,
    configuredDir: string | undefined,
    defaultDir: string,
    dirType: 'hooks' | 'skills',
    results: FolderDiscoveryResults,
  ): string | null {
    const dirName = configuredDir ?? defaultDir;
    if (!dirName.trim()) {
      results.discoveryErrors.push(
        `Invalid ${dirType} directory path: "${dirName}". ${this.capitalize(dirType)} directory must be within the extension directory.`,
      );
      return null;
    }

    const resolvedDir = path.resolve(extensionDir, dirName);
    if (!isSubpath(extensionDir, resolvedDir)) {
      results.discoveryErrors.push(
        `Invalid ${dirType} directory path: "${dirName}". ${this.capitalize(dirType)} directory must be within the extension directory.`,
      );
      return null;
    }

    return resolvedDir;
  }

  private static capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private static addUniqueItems(target: string[], items: string[]) {
    const existing = new Set(target);
    for (const item of items) {
      if (!existing.has(item)) {
        target.push(item);
        existing.add(item);
      }
    }
  }

  private static getStringProperty(
    record: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private static isRecord(val: unknown): val is Record<string, unknown> {
    return !!val && typeof val === 'object' && !Array.isArray(val);
  }

  private static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        return false;
      }
      throw e;
    }
  }
}
