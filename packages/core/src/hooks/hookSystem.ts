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
import type {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
  DefaultHookOutput,
} from './types.js';
import type { AggregatedHookResult } from './hookAggregator.js';
/**
 * Main hook system that coordinates all hook-related functionality
 */
export class HookSystem {
  private readonly config: Config;
  private readonly hookRegistry: HookRegistry;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;

  constructor(config: Config) {
    this.config = config;
    const logger: Logger = logs.getLogger(SERVICE_NAME);
    const messageBus = config.getMessageBus();

    // Initialize components
    this.hookRegistry = new HookRegistry(config);
    this.hookRunner = new HookRunner(config);
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
    await this.hookRegistry.initialize();
    debugLogger.debug('Hook system initialized successfully');
  }

  /**
   * Get the hook event bus for firing events
   */
  getEventHandler(): HookEventHandler {
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
   * Fire hook events directly
   * Returns undefined if hooks are disabled
   */
  async fireSessionStartEvent(
    source: SessionStartSource,
  ): Promise<AggregatedHookResult | undefined> {
    if (!this.config.getEnableHooks()) {
      return undefined;
    }
    return this.hookEventHandler.fireSessionStartEvent(source);
  }

  async fireSessionEndEvent(
    reason: SessionEndReason,
  ): Promise<AggregatedHookResult | undefined> {
    if (!this.config.getEnableHooks()) {
      return undefined;
    }
    return this.hookEventHandler.fireSessionEndEvent(reason);
  }

  async firePreCompressEvent(
    trigger: PreCompressTrigger,
  ): Promise<AggregatedHookResult | undefined> {
    if (!this.config.getEnableHooks()) {
      return undefined;
    }
    return this.hookEventHandler.firePreCompressEvent(trigger);
  }

  async fireBeforeAgentEvent(
    prompt: string,
  ): Promise<DefaultHookOutput | undefined> {
    if (!this.config.getEnableHooks()) {
      return undefined;
    }
    const result = await this.hookEventHandler.fireBeforeAgentEvent(prompt);
    return result.finalOutput;
  }

  async fireAfterAgentEvent(
    prompt: string,
    response: string,
    stopHookActive: boolean = false,
  ): Promise<DefaultHookOutput | undefined> {
    if (!this.config.getEnableHooks()) {
      return undefined;
    }
    const result = await this.hookEventHandler.fireAfterAgentEvent(
      prompt,
      response,
      stopHookActive,
    );
    return result.finalOutput;
  }
}
