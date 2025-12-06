/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { HookRegistry } from './hookRegistry.js';
import { HookRunner } from './hookRunner.js';
import { HookAggregator } from './hookAggregator.js';
import { HookPlanner } from './hookPlanner.js';
import { HookEventHandler } from './hookEventHandler.js';
import type { HookRegistryEntry } from './hookRegistry.js';
import { logs, type Logger } from '@opentelemetry/api-logs';
import { SERVICE_NAME } from '../telemetry/constants.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Main hook system that coordinates all hook-related functionality
 */
export class HookSystem {
  private readonly hookRegistry: HookRegistry;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;
  private initialized = false;

  constructor(config: Config) {
    const logger: Logger = logs.getLogger(SERVICE_NAME);
    const messageBus = config.getMessageBus();

    // Initialize components
    this.hookRegistry = new HookRegistry(config);
    this.hookRunner = new HookRunner();
    this.hookAggregator = new HookAggregator();
    this.hookPlanner = new HookPlanner(this.hookRegistry);
    this.hookEventHandler = new HookEventHandler(
      config,
      logger,
      this.hookPlanner,
      this.hookRunner,
      this.hookAggregator,
      messageBus, // Pass MessageBus to enable mediated hook execution
    );
  }

  /**
   * Initialize the hook system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.hookRegistry.initialize();
    this.initialized = true;
    debugLogger.debug('Hook system initialized successfully');
  }

  /**
   * Get the hook event bus for firing events
   */
  getEventHandler(): HookEventHandler {
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
   * Get hook system status for debugging
   */
  getStatus(): {
    initialized: boolean;
    totalHooks: number;
  } {
    const allHooks = this.initialized ? this.hookRegistry.getAllHooks() : [];

    return {
      initialized: this.initialized,
      totalHooks: allHooks.length,
    };
  }
}
