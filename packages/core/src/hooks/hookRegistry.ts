/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { HookDefinition, HookConfig } from '../config/config.js';
import { HookEventName } from '../config/config.js';

/**
 * Configuration source levels in precedence order (highest to lowest)
 */
export enum ConfigSource {
  Project = 'project',
  User = 'user',
  System = 'system',
  Extensions = 'extensions',
}

/**
 * Hook registry entry with source information
 */
export interface HookRegistryEntry {
  config: HookConfig;
  source: ConfigSource;
  eventName: HookEventName;
  matcher?: string;
  sequential?: boolean;
  enabled: boolean;
}

/**
 * Hook registry that loads and validates hook definitions from multiple sources
 */
export class HookRegistry {
  private readonly config: Config;
  private entries: HookRegistryEntry[] = [];
  private initialized = false;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Initialize the registry by processing hooks from config
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.entries = [];
    this.processHooksFromConfig();
    this.initialized = true;

    console.log(
      `Hook registry initialized with ${this.entries.length} hook entries`,
    );
  }

  /**
   * Get all hook entries for a specific event
   */
  getHooksForEvent(eventName: HookEventName): HookRegistryEntry[] {
    if (!this.initialized) {
      throw new Error('Hook registry not initialized');
    }

    return this.entries
      .filter((entry) => entry.eventName === eventName && entry.enabled)
      .sort(
        (a, b) =>
          this.getSourcePriority(a.source) - this.getSourcePriority(b.source),
      );
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): HookRegistryEntry[] {
    if (!this.initialized) {
      throw new Error('Hook registry not initialized');
    }

    return [...this.entries];
  }

  /**
   * Enable or disable a specific hook
   */
  setHookEnabled(hookName: string, enabled: boolean): void {
    const updated = this.entries.filter((entry) => {
      const name = this.getHookName(entry);
      if (name === hookName) {
        entry.enabled = enabled;
        return true;
      }
      return false;
    });

    if (updated.length > 0) {
      console.log(
        `${enabled ? 'Enabled' : 'Disabled'} ${updated.length} hook(s) matching "${hookName}"`,
      );
    } else {
      console.warn(`No hooks found matching "${hookName}"`);
    }
  }

  /**
   * Get hook name for display purposes
   */
  private getHookName(entry: HookRegistryEntry): string {
    if (entry.config.type === 'command') {
      return entry.config.command || 'unknown-command';
    } else {
      return `${entry.config.package}.${entry.config.method}`;
    }
  }

  /**
   * Process hooks from the config that was already loaded by the CLI
   */
  private processHooksFromConfig(): void {
    // Get hooks from the main config (this comes from the merged settings)
    const configHooks = this.config.getHooks();
    if (configHooks) {
      this.processHooksConfiguration(configHooks, ConfigSource.Project);
    }

    // Get hooks from extensions
    const extensions = this.config.getExtensions() || [];
    for (const extension of extensions) {
      if (extension.isActive && extension.hooks) {
        this.processHooksConfiguration(
          extension.hooks,
          ConfigSource.Extensions,
        );
      }
    }
  }

  /**
   * Process hooks configuration and add entries
   */
  private processHooksConfiguration(
    hooksConfig: { [K in HookEventName]?: HookDefinition[] },
    source: ConfigSource,
  ): void {
    for (const [eventName, definitions] of Object.entries(hooksConfig)) {
      if (!this.isValidEventName(eventName)) {
        console.warn(`Invalid hook event name: ${eventName}`);
        continue;
      }

      const typedEventName = eventName as HookEventName;

      for (const definition of definitions || []) {
        this.processHookDefinition(definition, typedEventName, source);
      }
    }
  }

  /**
   * Process a single hook definition
   */
  private processHookDefinition(
    definition: HookDefinition,
    eventName: HookEventName,
    source: ConfigSource,
  ): void {
    for (const hookConfig of definition.hooks) {
      if (this.validateHookConfig(hookConfig, eventName, source)) {
        this.entries.push({
          config: hookConfig,
          source,
          eventName,
          matcher: definition.matcher,
          sequential: definition.sequential,
          enabled: true,
        });
      } else {
        // Invalid hooks are logged and discarded here, they won't reach HookRunner
        console.warn(
          `Discarding invalid hook configuration for ${eventName} from ${source}:`,
          hookConfig,
        );
      }
    }
  }

  /**
   * Validate a hook configuration
   */
  private validateHookConfig(
    config: HookConfig,
    eventName: HookEventName,
    source: ConfigSource,
  ): boolean {
    if (!config.type || !['command', 'plugin'].includes(config.type)) {
      console.warn(
        `Invalid hook ${eventName} from ${source} type: ${config.type}`,
      );
      return false;
    }

    if (config.type === 'command' && !config.command) {
      console.warn(
        `Command hook ${eventName} from ${source} missing command field`,
      );
      return false;
    }

    if (config.type === 'plugin' && (!config.package || !config.method)) {
      console.warn(
        `Plugin hook ${eventName} from ${source} missing package or method field`,
      );
      return false;
    }

    return true;
  }

  /**
   * Check if an event name is valid
   */
  private isValidEventName(eventName: string): eventName is HookEventName {
    const validEventNames = Object.values(HookEventName);
    return validEventNames.includes(eventName as HookEventName);
  }

  /**
   * Get source priority (lower number = higher priority)
   */
  private getSourcePriority(source: ConfigSource): number {
    switch (source) {
      case ConfigSource.Project:
        return 1;
      case ConfigSource.User:
        return 2;
      case ConfigSource.System:
        return 3;
      case ConfigSource.Extensions:
        return 4;
      default:
        return 999;
    }
  }
}
