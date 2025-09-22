/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { pathToFileURL } from 'node:url';
import type { Config } from '../config/config.js';
import type { Logger } from '@opentelemetry/api-logs';
import type { HookConfig } from '../config/config.js';
import type { Plugin, Services, ApiVersion } from './types.js';
import { DefaultHttpClient } from './httpClient.js';

/**
 * Plugin instance with metadata
 */
export interface PluginInstance {
  plugin: Plugin;
  packageName: string;
  activated: boolean;
}

/**
 * Plugin manager that discovers, loads, and manages plugin lifecycle
 */
export class PluginManager {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly services: Services;
  private readonly loadedPlugins = new Map<string, PluginInstance>();
  private readonly supportedApiVersions: Set<ApiVersion> = new Set(['1.0']);

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.services = {
      logger: this.logger,
      config: this.config,
      http: new DefaultHttpClient(),
    };
  }

  /**
   * Load a plugin from a package
   */
  async loadPlugin(packageName: string): Promise<PluginInstance | undefined> {
    try {
      // Check if already loaded
      const existing = this.loadedPlugins.get(packageName);
      if (existing) {
        return existing;
      }

      console.debug(`Loading plugin: ${packageName}`);

      // Try to resolve and import the plugin
      const plugin = await this.importPlugin(packageName);

      if (!plugin) {
        console.warn(`Failed to import plugin: ${packageName}`);
        return undefined;
      }

      // Validate plugin
      if (!this.validatePlugin(plugin)) {
        console.warn(`Invalid plugin: ${packageName}`);
        return undefined;
      }

      // Check API version compatibility
      if (!this.isApiVersionSupported(plugin.apiVersion)) {
        console.warn(
          `Unsupported API version ${plugin.apiVersion} for plugin: ${packageName}`,
        );
        return undefined;
      }

      // Create plugin instance
      const instance: PluginInstance = {
        plugin,
        packageName,
        activated: false,
      };

      this.loadedPlugins.set(packageName, instance);
      console.log(`Successfully loaded plugin: ${packageName}`);

      return instance;
    } catch (error) {
      console.error(`Failed to load plugin ${packageName}: ${error}`);
      return undefined;
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(packageName: string): Promise<boolean> {
    try {
      const instance = this.loadedPlugins.get(packageName);
      if (!instance) {
        console.warn(`Plugin not loaded: ${packageName}`);
        return false;
      }

      if (instance.activated) {
        return true; // Already activated
      }

      console.debug(`Activating plugin: ${packageName}`);

      // Call plugin's activate method
      await instance.plugin.activate(this.services);
      instance.activated = true;

      console.log(`Successfully activated plugin: ${packageName}`);
      return true;
    } catch (error) {
      console.error(`Failed to activate plugin ${packageName}: ${error}`);
      return false;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(packageName: string): Promise<boolean> {
    try {
      const instance = this.loadedPlugins.get(packageName);
      if (!instance || !instance.activated) {
        return true; // Not activated or doesn't exist
      }

      console.debug(`Deactivating plugin: ${packageName}`);

      // Call plugin's deactivate method if it exists
      if (instance.plugin.deactivate) {
        await instance.plugin.deactivate(this.services);
      }

      instance.activated = false;

      console.log(`Successfully deactivated plugin: ${packageName}`);
      return true;
    } catch (error) {
      console.error(`Failed to deactivate plugin ${packageName}: ${error}`);
      return false;
    }
  }

  /**
   * Get a loaded plugin instance
   */
  getPlugin(packageName: string): PluginInstance | undefined {
    return this.loadedPlugins.get(packageName);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Ensure plugin is loaded and activated
   */
  async ensurePluginReady(
    hookConfig: HookConfig,
  ): Promise<PluginInstance | undefined> {
    if (hookConfig.type !== 'plugin' || !hookConfig.package) {
      return undefined;
    }

    const packageName = hookConfig.package;

    // Load if not already loaded
    let instance = this.loadedPlugins.get(packageName);
    if (!instance) {
      instance = await this.loadPlugin(packageName);
      if (!instance) {
        return undefined;
      }
    }

    // Activate if not already activated
    if (!instance.activated) {
      const activated = await this.activatePlugin(packageName);
      if (!activated) {
        return undefined;
      }
    }

    return instance;
  }

  /**
   * Deactivate all plugins (typically called on session end)
   */
  async deactivateAllPlugins(): Promise<void> {
    const deactivationPromises = Array.from(this.loadedPlugins.keys()).map(
      (packageName) => this.deactivatePlugin(packageName),
    );

    await Promise.allSettled(deactivationPromises);
  }

  /**
   * Import a plugin module
   */
  private async importPlugin(packageName: string): Promise<Plugin | undefined> {
    try {
      // Try different import strategies
      let pluginModule: unknown;

      try {
        // Try as ES module first
        pluginModule = await import(packageName);
      } catch (esError) {
        try {
          // Try resolving as local path
          const resolvedPath = require.resolve(packageName, {
            paths: [this.config.getWorkingDir(), process.cwd()],
          });
          const fileUrl = pathToFileURL(resolvedPath).href;
          pluginModule = await import(fileUrl);
        } catch (pathError) {
          console.error(
            `Failed to import ${packageName} as ES module or local path: ${esError}, ${pathError}`,
          );
          return undefined;
        }
      }

      // Extract the plugin from the module
      if (pluginModule && typeof pluginModule === 'object') {
        // Try default export first
        if (
          'default' in pluginModule &&
          this.isPluginLike(pluginModule.default)
        ) {
          return pluginModule.default as Plugin;
        }

        // Try named export
        if (this.isPluginLike(pluginModule)) {
          return pluginModule as Plugin;
        }

        // Look for any plugin-like export
        for (const exportValue of Object.values(pluginModule)) {
          if (this.isPluginLike(exportValue)) {
            return exportValue as Plugin;
          }
        }
      }

      return undefined;
    } catch (error) {
      console.warn(`Failed to import plugin ${packageName}: ${error}`);
      return undefined;
    }
  }

  /**
   * Check if an object looks like a plugin
   */
  private isPluginLike(obj: unknown): boolean {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      'apiVersion' in obj &&
      'name' in obj &&
      'activate' in obj &&
      'hooks' in obj
    );
  }

  /**
   * Validate a plugin object
   */
  private validatePlugin(plugin: Plugin): boolean {
    try {
      // Check required fields (apiVersion is optional for legacy plugins)
      if (!plugin.name || !plugin.activate || !plugin.hooks) {
        return false;
      }

      // Check types
      if (
        typeof plugin.name !== 'string' ||
        typeof plugin.activate !== 'function'
      ) {
        return false;
      }

      if (typeof plugin.hooks !== 'object' || plugin.hooks === null) {
        return false;
      }

      // Check optional deactivate method
      if (plugin.deactivate && typeof plugin.deactivate !== 'function') {
        return false;
      }

      // Validate hook methods
      for (const [hookName, hookMethod] of Object.entries(plugin.hooks)) {
        if (hookMethod && typeof hookMethod !== 'function') {
          console.warn(
            `Invalid hook method ${hookName} in plugin ${plugin.name}`,
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn(`Plugin validation error: ${error}`);
      return false;
    }
  }

  /**
   * Check if an API version is supported
   */
  private isApiVersionSupported(version: ApiVersion | undefined): boolean {
    // Support legacy plugins without explicit API version
    if (!version) return true;
    return this.supportedApiVersions.has(version);
  }
}
