/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import stripJsonComments from 'strip-json-comments';
import { GEMINI_DIR } from '@google/gemini-cli-core';

export interface FolderDiscoveryResults {
  commands: string[];
  mcps: string[];
  hooks: string[];
  skills: string[];
  settings: string[];
  securityWarnings: string[];
  discoveryErrors: string[];
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
      settings: [],
      securityWarnings: [],
      discoveryErrors: [],
    };

    const geminiDir = path.join(workspaceDir, GEMINI_DIR);
    if (!existsSync(geminiDir)) {
      return results;
    }

    await Promise.all([
      this.discoverCommands(geminiDir, results),
      this.discoverSkills(geminiDir, results),
      this.discoverSettings(geminiDir, results),
    ]);

    return results;
  }

  private static async discoverCommands(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const commandsDir = path.join(geminiDir, 'commands');
    if (existsSync(commandsDir)) {
      try {
        const files = await fs.readdir(commandsDir, { recursive: true });
        results.commands = files
          .filter((f) => f.endsWith('.toml'))
          .map((f) => path.basename(f, '.toml'));
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover commands: ${(e as Error).message}`,
        );
      }
    }
  }

  private static async discoverSkills(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const skillsDir = path.join(geminiDir, 'skills');
    if (existsSync(skillsDir)) {
      try {
        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
            if (existsSync(skillMdPath)) {
              results.skills.push(entry.name);
            }
          }
        }
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover skills: ${(e as Error).message}`,
        );
      }
    }
  }

  private static async discoverSettings(
    geminiDir: string,
    results: FolderDiscoveryResults,
  ) {
    const settingsPath = path.join(geminiDir, 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(stripJsonComments(content)) as Record<
          string,
          unknown
        >;

        const EXCLUDED_KEYS = ['mcpServers', 'hooks', '$schema'];
        results.settings = Object.keys(settings).filter(
          (key) => !EXCLUDED_KEYS.includes(key),
        );

        results.securityWarnings = this.collectSecurityWarnings(settings);

        if (
          settings['mcpServers'] &&
          typeof settings['mcpServers'] === 'object' &&
          !Array.isArray(settings['mcpServers'])
        ) {
          results.mcps = Object.keys(settings['mcpServers']);
        }

        const hooksConfig = settings['hooks'];
        if (
          hooksConfig &&
          typeof hooksConfig === 'object' &&
          !Array.isArray(hooksConfig)
        ) {
          const hooks = new Set<string>();
          for (const event of Object.values(hooksConfig)) {
            if (Array.isArray(event)) {
              for (const hook of event) {
                if (
                  hook &&
                  typeof hook === 'object' &&
                  'command' in hook &&
                  typeof hook.command === 'string'
                ) {
                  hooks.add(hook.command);
                }
              }
            }
          }
          results.hooks = Array.from(hooks);
        }
      } catch (e) {
        results.discoveryErrors.push(
          `Failed to discover settings: ${(e as Error).message}`,
        );
      }
    }
  }

  private static collectSecurityWarnings(
    settings: Record<string, unknown>,
  ): string[] {
    const warnings: string[] = [];

    // 1. tools.allowed
    const tools = settings['tools'] as Record<string, unknown> | undefined;
    const toolsAllowed = tools?.['allowed'];
    if (Array.isArray(toolsAllowed) && toolsAllowed.length > 0) {
      warnings.push(
        'This project auto-approves certain tools (tools.allowed).',
      );
    }

    // 2. experimental.enableAgents
    const experimental = settings['experimental'] as
      | Record<string, unknown>
      | undefined;
    if (experimental?.['enableAgents'] === true) {
      warnings.push('This project enables autonomous agents (enableAgents).');
    }

    // 3. security.folderTrust.enabled
    const security = settings['security'] as
      | Record<string, unknown>
      | undefined;
    const folderTrust = security?.['folderTrust'] as
      | Record<string, unknown>
      | undefined;
    if (folderTrust?.['enabled'] === false) {
      warnings.push(
        'This project attempts to disable folder trust (security.folderTrust.enabled).',
      );
    }

    // 4. tools.sandbox
    if (tools?.['sandbox'] === false) {
      warnings.push(
        'This project disables the security sandbox (tools.sandbox).',
      );
    }

    return warnings;
  }
}
