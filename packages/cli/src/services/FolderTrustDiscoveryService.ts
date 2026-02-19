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
    if (!existsSync(settingsPath)) return;

    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(stripJsonComments(content)) as Record<
        string,
        unknown
      >;

      results.settings = Object.keys(settings).filter(
        (key) => !['mcpServers', 'hooks', '$schema'].includes(key),
      );

      results.securityWarnings = this.collectSecurityWarnings(settings);

      const mcpServers = settings['mcpServers'];
      if (
        mcpServers &&
        typeof mcpServers === 'object' &&
        !Array.isArray(mcpServers)
      ) {
        results.mcps = Object.keys(mcpServers);
      }

      const hooksConfig = settings['hooks'];
      if (
        hooksConfig &&
        typeof hooksConfig === 'object' &&
        !Array.isArray(hooksConfig)
      ) {
        const hooks = new Set<string>();
        for (const event of Object.values(hooksConfig)) {
          if (!Array.isArray(event)) continue;
          for (const hook of event) {
            if (
              hook &&
              typeof hook === 'object' &&
              'command' in hook &&
              typeof (hook as Record<string, unknown>)['command'] === 'string'
            ) {
              hooks.add((hook as Record<string, string>)['command']);
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

  private static collectSecurityWarnings(
    settings: Record<string, unknown>,
  ): string[] {
    const warnings: string[] = [];

    const tools = settings['tools'] as Record<string, unknown> | undefined;
    const experimental = settings['experimental'] as
      | Record<string, unknown>
      | undefined;
    const security = settings['security'] as
      | Record<string, unknown>
      | undefined;
    const folderTrust = security?.['folderTrust'] as
      | Record<string, unknown>
      | undefined;

    const allowedTools = tools?.['allowed'];

    const checks = [
      {
        condition: Array.isArray(allowedTools) && allowedTools.length > 0,
        message: 'This project auto-approves certain tools (tools.allowed).',
      },
      {
        condition: experimental?.['enableAgents'] === true,
        message: 'This project enables autonomous agents (enableAgents).',
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
}
