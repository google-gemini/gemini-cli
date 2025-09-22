/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { HookRegistry } from './hookRegistry.js';
import { PluginManager } from './pluginManager.js';
import { HookRunner } from './hookRunner.js';
import { HookAggregator } from './hookAggregator.js';
import { HookPlanner } from './hookPlanner.js';
import { HookEventHandler } from './hookEventHandler.js';
import type { HookRegistryEntry } from './hookRegistry.js';
import { logs, type Logger } from '@opentelemetry/api-logs';
import { SERVICE_NAME } from '../telemetry/constants.js';

/**
 * Main hook system that coordinates all hook-related functionality
 */
export class HookSystem {
  private readonly hookRegistry: HookRegistry;
  private readonly pluginManager: PluginManager;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;
  private initialized = false;

  constructor(config: Config) {
    const logger: Logger = logs.getLogger(SERVICE_NAME);
    // Initialize components
    this.hookRegistry = new HookRegistry(config);
    this.pluginManager = new PluginManager(config, logger);
    this.hookRunner = new HookRunner(logger, this.pluginManager);
    this.hookAggregator = new HookAggregator();
    this.hookPlanner = new HookPlanner(logger, this.hookRegistry);
    this.hookEventHandler = new HookEventHandler(
      config,
      logger,
      this.hookPlanner,
      this.hookRunner,
      this.hookAggregator,
    );
  }

  /**
   * Initialize the hook system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.hookRegistry.initialize();
      this.initialized = true;
      console.log('Hook system initialized successfully');
    } catch (error) {
      console.error(`Failed to initialize hook system: ${error}`);
      throw error;
    }
  }

  /**
   * Get the hook event bus for firing events
   */
  getEventBus(): HookEventHandler {
    if (!this.initialized) {
      throw new Error('Hook system not initialized');
    }
    return this.hookEventHandler;
  }

  /**
   * Get hook registry for management operations
   */
  getRegistry(): HookRegistry {
    return this.hookRegistry;
  }

  /**
   * Get plugin manager for plugin operations
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * Enable or disable a hook
   */
  setHookEnabled(hookName: string, enabled: boolean): void {
    this.hookRegistry.setHookEnabled(hookName, enabled);
  }

  /**
   * Get all registered hooks for display/management
   */
  getAllHooks(): HookRegistryEntry[] {
    return this.hookRegistry.getAllHooks();
  }

  /**
   * Install a plugin hook from npm
   */
  async installPluginHook(packageName: string): Promise<boolean> {
    try {
      const instance = await this.pluginManager.loadPlugin(packageName);
      if (!instance) {
        return false;
      }

      const activated = await this.pluginManager.activatePlugin(packageName);
      if (!activated) {
        return false;
      }

      console.log(`Successfully installed plugin hook: ${packageName}`);
      return true;
    } catch (error) {
      console.error(`Failed to install plugin hook ${packageName}: ${error}`);
      return false;
    }
  }

  /**
   * Uninstall a plugin hook
   */
  async uninstallPluginHook(packageName: string): Promise<boolean> {
    try {
      await this.pluginManager.deactivatePlugin(packageName);
      console.log(`Successfully uninstalled plugin hook: ${packageName}`);
      return true;
    } catch (error) {
      console.error(`Failed to uninstall plugin hook ${packageName}: ${error}`);
      return false;
    }
  }

  /**
   * Cleanup hook system (typically called on session end)
   */
  async cleanup(): Promise<void> {
    try {
      await this.pluginManager.deactivateAllPlugins();
      console.log('Hook system cleaned up successfully');
    } catch (error) {
      console.error(`Error during hook system cleanup: ${error}`);
    }
  }

  /**
   * Get hook system status for debugging
   */
  getStatus(): {
    initialized: boolean;
    totalHooks: number;
    loadedPlugins: number;
    activePlugins: number;
  } {
    const allHooks = this.initialized ? this.hookRegistry.getAllHooks() : [];
    const allPlugins = this.pluginManager.getAllPlugins();
    const activePlugins = allPlugins.filter((p) => p.activated);

    return {
      initialized: this.initialized,
      totalHooks: allHooks.length,
      loadedPlugins: allPlugins.length,
      activePlugins: activePlugins.length,
    };
  }
}
