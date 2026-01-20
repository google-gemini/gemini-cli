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
  BeforeModelHookOutput,
  AfterModelHookOutput,
  BeforeToolSelectionHookOutput,
} from './types.js';
import type { AggregatedHookResult } from './hookAggregator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type {
  AfterModelHookResult,
  BeforeModelHookResult,
  BeforeToolSelectionHookResult,
} from '../core/geminiChatHookTriggers.js';
/**
 * Main hook system that coordinates all hook-related functionality
 */
export class HookSystem {
  private readonly hookRegistry: HookRegistry;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;

  constructor(config: Config) {
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
   */
  async fireSessionStartEvent(
    source: SessionStartSource,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireSessionStartEvent(source);
    return result.finalOutput;
  }

  async fireSessionEndEvent(
    reason: SessionEndReason,
  ): Promise<AggregatedHookResult | undefined> {
    return this.hookEventHandler.fireSessionEndEvent(reason);
  }

  async firePreCompressEvent(
    trigger: PreCompressTrigger,
  ): Promise<AggregatedHookResult | undefined> {
    return this.hookEventHandler.firePreCompressEvent(trigger);
  }

  async fireBeforeAgentEvent(
    prompt: string,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireBeforeAgentEvent(prompt);
    return result.finalOutput;
  }

  async fireAfterAgentEvent(
    prompt: string,
    response: string,
    stopHookActive: boolean = false,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireAfterAgentEvent(
      prompt,
      response,
      stopHookActive,
    );
    return result.finalOutput;
  }

  async fireBeforeModelEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<BeforeModelHookResult> {
    try {
      const result =
        await this.hookEventHandler.fireBeforeModelEvent(llmRequest);
      const hookOutput = result.finalOutput;

      if (hookOutput?.shouldStopExecution()) {
        return {
          blocked: true,
          stopped: true,
          reason: hookOutput.getEffectiveReason(),
        };
      }

      const blockingError = hookOutput?.getBlockingError();
      if (blockingError?.blocked) {
        const beforeModelOutput = hookOutput as BeforeModelHookOutput;
        const syntheticResponse = beforeModelOutput.getSyntheticResponse();
        return {
          blocked: true,
          reason:
            hookOutput?.getEffectiveReason() || 'Model call blocked by hook',
          syntheticResponse,
        };
      }

      if (hookOutput) {
        const beforeModelOutput = hookOutput as BeforeModelHookOutput;
        const modifiedRequest =
          beforeModelOutput.applyLLMRequestModifications(llmRequest);
        return {
          blocked: false,
          modifiedConfig: modifiedRequest?.config,
          modifiedContents: modifiedRequest?.contents,
        };
      }

      return { blocked: false };
    } catch (error) {
      debugLogger.debug(`BeforeModelHookEvent failed:`, error);
      return { blocked: false };
    }
  }

  async fireAfterModelEvent(
    originalRequest: GenerateContentParameters,
    chunk: GenerateContentResponse,
  ): Promise<AfterModelHookResult> {
    try {
      const result = await this.hookEventHandler.fireAfterModelEvent(
        originalRequest,
        chunk,
      );
      const hookOutput = result.finalOutput;

      if (hookOutput?.shouldStopExecution()) {
        return {
          response: chunk,
          stopped: true,
          reason: hookOutput.getEffectiveReason(),
        };
      }

      const blockingError = hookOutput?.getBlockingError();
      if (blockingError?.blocked) {
        return {
          response: chunk,
          blocked: true,
          reason: hookOutput?.getEffectiveReason(),
        };
      }

      if (hookOutput) {
        const afterModelOutput = hookOutput as AfterModelHookOutput;
        const modifiedResponse = afterModelOutput.getModifiedResponse();
        if (modifiedResponse) {
          return { response: modifiedResponse };
        }
      }

      return { response: chunk };
    } catch (error) {
      debugLogger.debug(`AfterModelHookEvent failed:`, error);
      return { response: chunk };
    }
  }

  async fireBeforeToolSelectionEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<BeforeToolSelectionHookResult> {
    try {
      const result =
        await this.hookEventHandler.fireBeforeToolSelectionEvent(llmRequest);
      const hookOutput = result.finalOutput;

      if (hookOutput) {
        const toolSelectionOutput = hookOutput as BeforeToolSelectionHookOutput;
        const modifiedConfig = toolSelectionOutput.applyToolConfigModifications(
          {
            toolConfig: llmRequest.config?.toolConfig,
            tools: llmRequest.config?.tools,
          },
        );
        return {
          toolConfig: modifiedConfig.toolConfig,
          tools: modifiedConfig.tools,
        };
      }
      return {};
    } catch (error) {
      debugLogger.debug(`BeforeToolSelectionEvent failed:`, error);
      return {};
    }
  }
}
