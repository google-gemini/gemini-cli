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
import { debugLogger } from '../utils/debugLogger.js';
import type {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
  DefaultHookOutput,
  BeforeModelHookOutput,
  AfterModelHookOutput,
  BeforeToolSelectionHookOutput,
  McpToolContext,
} from './types.js';
import { NotificationType } from './types.js';
import type { AggregatedHookResult } from './hookAggregator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentConfig,
  ContentListUnion,
  ToolConfig,
  ToolListUnion,
} from '@google/genai';
import type { ToolCallConfirmationDetails } from '../tools/tools.js';

/**
 * Main hook system that coordinates all hook-related functionality
 */

export interface BeforeModelHookResult {
  /** Whether the model call was blocked */
  blocked: boolean;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Synthetic response to return instead of calling the model (if blocked) */
  syntheticResponse?: GenerateContentResponse;
  /** Modified config (if not blocked) */
  modifiedConfig?: GenerateContentConfig;
  /** Modified contents (if not blocked) */
  modifiedContents?: ContentListUnion;
}

/**
 * Result from firing the BeforeToolSelection hook.
 */
export interface BeforeToolSelectionHookResult {
  /** Modified tool config */
  toolConfig?: ToolConfig;
  /** Modified tools */
  tools?: ToolListUnion;
}

/**
 * Result from firing the AfterModel hook.
 * Contains either a modified response or indicates to use the original chunk.
 */
export interface AfterModelHookResult {
  /** The response to yield (either modified or original) */
  response: GenerateContentResponse;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Whether the model call was blocked */
  blocked?: boolean;
  /** Reason for blocking or stopping */
  reason?: string;
}

/**
 * Converts ToolCallConfirmationDetails to a serializable format for hooks.
 * Excludes function properties (onConfirm, ideConfirmation) that can't be serialized.
 */
function toSerializableDetails(
  details: ToolCallConfirmationDetails,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: details.type,
    title: details.title,
  };

  switch (details.type) {
    case 'edit':
      return {
        ...base,
        fileName: details.fileName,
        filePath: details.filePath,
        fileDiff: details.fileDiff,
        originalContent: details.originalContent,
        newContent: details.newContent,
        isModifying: details.isModifying,
      };
    case 'exec':
      return {
        ...base,
        command: details.command,
        rootCommand: details.rootCommand,
      };
    case 'mcp':
      return {
        ...base,
        serverName: details.serverName,
        toolName: details.toolName,
        toolDisplayName: details.toolDisplayName,
      };
    case 'info':
      return {
        ...base,
        prompt: details.prompt,
        urls: details.urls,
      };
    default:
      return base;
  }
}

/**
 * Gets the message to display in the notification hook for tool confirmation.
 */
function getNotificationMessage(
  confirmationDetails: ToolCallConfirmationDetails,
): string {
  switch (confirmationDetails.type) {
    case 'edit':
      return `Tool ${confirmationDetails.title} requires editing`;
    case 'exec':
      return `Tool ${confirmationDetails.title} requires execution`;
    case 'mcp':
      return `Tool ${confirmationDetails.title} requires MCP`;
    case 'info':
      return `Tool ${confirmationDetails.title} requires information`;
    default:
      return `Tool requires confirmation`;
  }
}

export class HookSystem {
  private readonly hookRegistry: HookRegistry;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;

  constructor(config: Config) {
    // Initialize components
    this.hookRegistry = new HookRegistry(config);
    this.hookRunner = new HookRunner(config);
    this.hookAggregator = new HookAggregator();
    this.hookPlanner = new HookPlanner(this.hookRegistry);
    this.hookEventHandler = new HookEventHandler(
      config,
      this.hookPlanner,
      this.hookRunner,
      this.hookAggregator,
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

  async fireBeforeToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    mcpContext?: McpToolContext,
  ): Promise<DefaultHookOutput | undefined> {
    try {
      const result = await this.hookEventHandler.fireBeforeToolEvent(
        toolName,
        toolInput,
        mcpContext,
      );
      return result.finalOutput;
    } catch (error) {
      debugLogger.debug(`BeforeToolEvent failed for ${toolName}:`, error);
      return undefined;
    }
  }

  async fireAfterToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: {
      llmContent: unknown;
      returnDisplay: unknown;
      error: unknown;
    },
    mcpContext?: McpToolContext,
  ): Promise<DefaultHookOutput | undefined> {
    try {
      const result = await this.hookEventHandler.fireAfterToolEvent(
        toolName,
        toolInput,
        toolResponse as Record<string, unknown>,
        mcpContext,
      );
      return result.finalOutput;
    } catch (error) {
      debugLogger.debug(`AfterToolEvent failed for ${toolName}:`, error);
      return undefined;
    }
  }

  async fireToolNotificationEvent(
    confirmationDetails: ToolCallConfirmationDetails,
  ): Promise<void> {
    try {
      const message = getNotificationMessage(confirmationDetails);
      const serializedDetails = toSerializableDetails(confirmationDetails);

      await this.hookEventHandler.fireNotificationEvent(
        NotificationType.ToolPermission,
        message,
        serializedDetails,
      );
    } catch (error) {
      debugLogger.debug(
        `NotificationEvent failed for ${confirmationDetails.title}:`,
        error,
      );
    }
  }
}
