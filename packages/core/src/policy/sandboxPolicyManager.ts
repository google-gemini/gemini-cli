/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import toml from '@iarna/toml';
import { debugLogger } from '../utils/debugLogger.js';
import { type SandboxPermissions } from '../services/sandboxManager.js';

export interface SandboxModeConfig {
  network: boolean;
  readonly: boolean;
  approvedTools: string[];
}

export interface PersistentCommandConfig {
  allowed_paths?: string[];
  allow_network?: boolean;
}

export interface SandboxTomlSchema {
  modes: {
    plan: SandboxModeConfig;
    accepting_edits: SandboxModeConfig;
  };
  commands: Record<string, PersistentCommandConfig>;
}

export class SandboxPolicyManager {
  private static readonly DEFAULT_CONFIG: SandboxTomlSchema = {
    modes: {
      plan: {
        network: false,
        readonly: true,
        approvedTools: [],
      },
      accepting_edits: {
        network: true,
        readonly: false,
        approvedTools: ['sed', 'grep', 'awk', 'perl', 'cat', 'echo', 'mkdir', 'touch', 'rm'],
      },
    },
    commands: {},
  };

  private config: SandboxTomlSchema;
  private readonly configPath: string;
  private sessionApprovals: Record<string, SandboxPermissions> = {};

  constructor(customConfigPath?: string) {
    this.configPath = customConfigPath ?? path.join(os.homedir(), '.gemini', 'policies', 'sandbox.toml');
    this.config = this.loadConfig();
  }

  private loadConfig(): SandboxTomlSchema {
    if (!fs.existsSync(this.configPath)) {
      return SandboxPolicyManager.DEFAULT_CONFIG;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return toml.parse(content) as unknown as SandboxTomlSchema;
    } catch (e) {
      debugLogger.error(`Failed to parse sandbox.toml: ${e}`);
      return SandboxPolicyManager.DEFAULT_CONFIG;
    }
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const content = toml.stringify(this.config as unknown as toml.JsonMap);
      fs.writeFileSync(this.configPath, content);
    } catch (e) {
      debugLogger.error(`Failed to save sandbox.toml: ${e}`);
    }
  }

  getModeConfig(mode: 'plan' | 'accepting_edits' | string): SandboxModeConfig {
    if (mode === 'plan') return this.config.modes.plan;
    if (mode === 'accepting_edits' || mode === 'autoEdit') return this.config.modes.accepting_edits;
    
    // Default fallback
    return this.config.modes.plan;
  }

  getCommandPermissions(commandName: string): SandboxPermissions {
    const persistent = this.config.commands[commandName];
    const session = this.sessionApprovals[commandName];

    return {
      fileSystem: {
        read: [
          ...(persistent?.allowed_paths ?? []),
          ...(session?.fileSystem?.read ?? []),
        ],
        write: [
          ...(persistent?.allowed_paths ?? []),
          ...(session?.fileSystem?.write ?? []),
        ],
      },
      network: persistent?.allow_network || session?.network || false,
    };
  }

  addSessionApproval(commandName: string, permissions: SandboxPermissions): void {
    const existing = this.sessionApprovals[commandName] || { fileSystem: { read: [], write: [] }, network: false };
    
    this.sessionApprovals[commandName] = {
      fileSystem: {
        read: Array.from(new Set([...(existing.fileSystem?.read ?? []), ...(permissions.fileSystem?.read ?? [])])),
        write: Array.from(new Set([...(existing.fileSystem?.write ?? []), ...(permissions.fileSystem?.write ?? [])])),
      },
      network: existing.network || permissions.network || false,
    };
  }

  addPersistentApproval(commandName: string, permissions: SandboxPermissions): void {
    const existing = this.config.commands[commandName] || { allowed_paths: [], allow_network: false };
    
    const newPaths = new Set([
      ...(existing.allowed_paths ?? []),
      ...(permissions.fileSystem?.read ?? []),
      ...(permissions.fileSystem?.write ?? []),
    ]);

    this.config.commands[commandName] = {
      allowed_paths: Array.from(newPaths),
      allow_network: existing.allow_network || permissions.network || false,
    };

    this.saveConfig();
  }
}
