/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import {
  getHookKey,
  type HookDefinition,
  type HookEventName,
} from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

interface TrustedHooksConfig {
  [projectPath: string]: string[]; // Array of trusted hook keys (name:command)
}

export class TrustedHooksManager {
  private configPath: string;
  private trustedHooks: TrustedHooksConfig = {};

  constructor() {
    this.configPath = path.join(
      Storage.getGlobalGeminiDir(),
      'trusted_hooks.json',
    );
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.trustedHooks = JSON.parse(content);
      }
    } catch (error) {
      debugLogger.warn('Failed to load trusted hooks config', error);
      this.trustedHooks = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.trustedHooks, null, 2),
      );
    } catch (error) {
      debugLogger.warn('Failed to save trusted hooks config', error);
    }
  }

  /**
   * Get untrusted hooks for a project
   * @param projectPath Absolute path to the project root
   * @param hooks The hooks configuration to check
   * @returns List of untrusted hook commands/names
   */
  getUntrustedHooks(
    projectPath: string,
    hooks: { [K in HookEventName]?: HookDefinition[] },
  ): string[] {
    const trustedKeys = new Set(this.trustedHooks[projectPath] || []);
    const untrusted: string[] = [];

    for (const eventName of Object.keys(hooks)) {
      const definitions = hooks[eventName as HookEventName];
      if (!Array.isArray(definitions)) continue;

      for (const def of definitions) {
        if (!def || !Array.isArray(def.hooks)) continue;
        for (const hook of def.hooks) {
          const key = getHookKey(hook);
          if (!trustedKeys.has(key)) {
            // Return friendly name or command
            untrusted.push(hook.name || hook.command || 'unknown-hook');
          }
        }
      }
    }

    return Array.from(new Set(untrusted)); // Deduplicate
  }

  /**
   * Trust all provided hooks for a project
   */
  trustHooks(
    projectPath: string,
    hooks: { [K in HookEventName]?: HookDefinition[] },
  ): void {
    const currentTrusted = new Set(this.trustedHooks[projectPath] || []);

    for (const eventName of Object.keys(hooks)) {
      const definitions = hooks[eventName as HookEventName];
      if (!Array.isArray(definitions)) continue;

      for (const def of definitions) {
        if (!def || !Array.isArray(def.hooks)) continue;
        for (const hook of def.hooks) {
          currentTrusted.add(getHookKey(hook));
        }
      }
    }

    this.trustedHooks[projectPath] = Array.from(currentTrusted);
    this.save();
  }
}
