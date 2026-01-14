/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import type { HookPlanner, HookEventContext } from './hookPlanner.js';
import type { HookRunner } from './hookRunner.js';
import type { HookAggregator, AggregatedHookResult } from './hookAggregator.js';
import { HookEventName } from './types.js';
import type {
  HookConfig,
  HookInput,
  BeforeToolInput,
  AfterToolInput,
  BeforeAgentInput,
  NotificationInput,
  AfterAgentInput,
  SessionStartInput,
  SessionEndInput,
  PreCompressInput,
  BeforeModelInput,
  AfterModelInput,
  BeforeToolSelectionInput,
  NotificationType,
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
  HookExecutionResult,
  McpToolContext,
} from './types.js';
import { defaultHookTranslator } from './hookTranslator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { logHookCall } from '../telemetry/loggers.js';
import { HookCallEvent } from '../telemetry/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type HookExecutionRequest,
} from '../confirmation-bus/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

/**
 * Validates that a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates BeforeTool input fields
 */
function validateBeforeToolInput(input: Record<string, unknown>): {
  toolName: string;
  toolInput: Record<string, unknown>;
  mcpContext?: McpToolContext;
} {
  const toolName = input['tool_name'];
  const toolInput = input['tool_input'];
  const mcpContext = input['mcp_context'];
  if (typeof toolName !== 'string') {
    throw new Error(
      'Invalid input for BeforeTool hook event: tool_name must be a string',
    );
  }
  if (!isObject(toolInput)) {
    throw new Error(
      'Invalid input for BeforeTool hook event: tool_input must be an object',
    );
  }
  if (mcpContext !== undefined && !isObject(mcpContext)) {
    throw new Error(
      'Invalid input for BeforeTool hook event: mcp_context must be an object',
    );
  }
  return {
    toolName,
    toolInput,
    mcpContext: mcpContext as McpToolContext | undefined,
  };
}

/**
 * Validates AfterTool input fields
 */
function validateAfterToolInput(input: Record<string, unknown>): {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResponse: Record<string, unknown>;
  mcpContext?: McpToolContext;
} {
  const toolName = input['tool_name'];
  const toolInput = input['tool_input'];
  const toolResponse = input['tool_response'];
  const mcpContext = input['mcp_context'];
  if (typeof toolName !== 'string') {
    throw new Error(
      'Invalid input for AfterTool hook event: tool_name must be a string',
    );
  }
  if (!isObject(toolInput)) {
    throw new Error(
      'Invalid input for AfterTool hook event: tool_input must be an object',
    );
  }
  if (!isObject(toolResponse)) {
    throw new Error(
      'Invalid input for AfterTool hook event: tool_response must be an object',
    );
  }
  if (mcpContext !== undefined && !isObject(mcpContext)) {
    throw new Error(
      'Invalid input for AfterTool hook event: mcp_context must be an object',
    );
  }
  return {
    toolName,
    toolInput,
    toolResponse,
    mcpContext: mcpContext as McpToolContext | undefined,
  };
}

/**
 * Validates BeforeAgent input fields
 */
function validateBeforeAgentInput(input: Record<string, unknown>): {
  prompt: string;
} {
  const prompt = input['prompt'];
  if (typeof prompt !== 'string') {
    throw new Error(
      'Invalid input for BeforeAgent hook event: prompt must be a string',
    );
  }
  return { prompt };
}

/**
 * Validates AfterAgent input fields
 */
function validateAfterAgentInput(input: Record<string, unknown>): {
  prompt: string;
  promptResponse: string;
  stopHookActive: boolean;
} {
  const prompt = input['prompt'];
  const promptResponse = input['prompt_response'];
  const stopHookActive = input['stop_hook_active'];
  if (typeof prompt !== 'string') {
    throw new Error(
      'Invalid input for AfterAgent hook event: prompt must be a string',
    );
  }
  if (typeof promptResponse !== 'string') {
    throw new Error(
      'Invalid input for AfterAgent hook event: prompt_response must be a string',
    );
  }
  // stopHookActive defaults to false if not a boolean
  return {
    prompt,
    promptResponse,
    stopHookActive:
      typeof stopHookActive === 'boolean' ? stopHookActive : false,
  };
}

/**
 * Validates model-related input fields (llm_request)
 */
function validateModelInput(
  input: Record<string, unknown>,
  eventName: string,
): { llmRequest: GenerateContentParameters } {
  const llmRequest = input['llm_request'];
  if (!isObject(llmRequest)) {
    throw new Error(
      `Invalid input for ${eventName} hook event: llm_request must be an object`,
    );
  }
  return { llmRequest: llmRequest as unknown as GenerateContentParameters };
}

/**
 * Validates AfterModel input fields
 */
function validateAfterModelInput(input: Record<string, unknown>): {
  llmRequest: GenerateContentParameters;
  llmResponse: GenerateContentResponse;
} {
  const llmRequest = input['llm_request'];
  const llmResponse = input['llm_response'];
  if (!isObject(llmRequest)) {
    throw new Error(
      'Invalid input for AfterModel hook event: llm_request must be an object',
    );
  }
  if (!isObject(llmResponse)) {
    throw new Error(
      'Invalid input for AfterModel hook event: llm_response must be an object',
    );
  }
  return {
    llmRequest: llmRequest as unknown as GenerateContentParameters,
    llmResponse: llmResponse as unknown as GenerateContentResponse,
  };
}

/**
 * Validates Notification input fields
 */
function validateNotificationInput(input: Record<string, unknown>): {
  notificationType: NotificationType;
  message: string;
  details: Record<string, unknown>;
} {
  const notificationType = input['notification_type'];
  const message = input['message'];
  const details = input['details'];
  if (typeof notificationType !== 'string') {
    throw new Error(
      'Invalid input for Notification hook event: notification_type must be a string',
    );
  }
  if (typeof message !== 'string') {
    throw new Error(
      'Invalid input for Notification hook event: message must be a string',
    );
  }
  if (!isObject(details)) {
    throw new Error(
      'Invalid input for Notification hook event: details must be an object',
    );
  }
  return {
    notificationType: notificationType as NotificationType,
    message,
    details,
  };
}

/**
 * Validates SessionStart input fields
 */
function validateSessionStartInput(input: Record<string, unknown>): {
  source: SessionStartSource;
} {
  const source = input['source'];
  if (typeof source !== 'string') {
    throw new Error(
      'Invalid input for SessionStart hook event: source must be a string',
    );
  }
  return {
    source: source as SessionStartSource,
  };
}

/**
 * Validates SessionEnd input fields
 */
function validateSessionEndInput(input: Record<string, unknown>): {
  reason: SessionEndReason;
} {
  const reason = input['reason'];
  if (typeof reason !== 'string') {
    throw new Error(
      'Invalid input for SessionEnd hook event: reason must be a string',
    );
  }
  return {
    reason: reason as SessionEndReason,
  };
}

/**
 * Validates PreCompress input fields
 */
function validatePreCompressInput(input: Record<string, unknown>): {
  trigger: PreCompressTrigger;
} {
  const trigger = input['trigger'];
  if (typeof trigger !== 'string') {
    throw new Error(
      'Invalid input for PreCompress hook event: trigger must be a string',
    );
  }
  return {
    trigger: trigger as PreCompressTrigger,
  };
}

/**
 * Hook event bus that coordinates hook execution across the system
 */
export class HookEventHandler {
  private readonly config: Config;
  private readonly hookPlanner: HookPlanner;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly messageBus: MessageBus;

  constructor(
    config: Config,
    logger: Logger,
    hookPlanner: HookPlanner,
    hookRunner: HookRunner,
    hookAggregator: HookAggregator,
    messageBus: MessageBus,
  ) {
    this.config = config;
    this.hookPlanner = hookPlanner;
    this.hookRunner = hookRunner;
    this.hookAggregator = hookAggregator;
    this.messageBus = messageBus;

    // Subscribe to hook execution requests from MessageBus
    if (this.messageBus) {
      this.messageBus.subscribe<HookExecutionRequest>(
        MessageBusType.HOOK_EXECUTION_REQUEST,
        (request) => this.handleHookExecutionRequest(request),
      );
    }
  }

  /**
   * Fire a BeforeTool event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireBeforeToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    mcpContext?: McpToolContext,
  ): Promise<AggregatedHookResult> {
    const input: BeforeToolInput = {
      ...this.createBaseInput(HookEventName.BeforeTool),
      tool_name: toolName,
      tool_input: toolInput,
      ...(mcpContext && { mcp_context: mcpContext }),
    };

    const context: HookEventContext = { toolName };
    return this.executeHooks(HookEventName.BeforeTool, input, context);
  }

  /**
   * Fire an AfterTool event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireAfterToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: Record<string, unknown>,
    mcpContext?: McpToolContext,
  ): Promise<AggregatedHookResult> {
    const input: AfterToolInput = {
      ...this.createBaseInput(HookEventName.AfterTool),
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
      ...(mcpContext && { mcp_context: mcpContext }),
    };

    const context: HookEventContext = { toolName };
    return this.executeHooks(HookEventName.AfterTool, input, context);
  }

  /**
   * Fire a BeforeAgent event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireBeforeAgentEvent(prompt: string): Promise<AggregatedHookResult> {
    const input: BeforeAgentInput = {
      ...this.createBaseInput(HookEventName.BeforeAgent),
      prompt,
    };

    return this.executeHooks(HookEventName.BeforeAgent, input);
  }

  /**
   * Fire a Notification event
   */
  async fireNotificationEvent(
    type: NotificationType,
    message: string,
    details: Record<string, unknown>,
  ): Promise<AggregatedHookResult> {
    const input: NotificationInput = {
      ...this.createBaseInput(HookEventName.Notification),
      notification_type: type,
      message,
      details,
    };

    return this.executeHooks(HookEventName.Notification, input);
  }

  /**
   * Fire an AfterAgent event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireAfterAgentEvent(
    prompt: string,
    promptResponse: string,
    stopHookActive: boolean = false,
  ): Promise<AggregatedHookResult> {
    const input: AfterAgentInput = {
      ...this.createBaseInput(HookEventName.AfterAgent),
      prompt,
      prompt_response: promptResponse,
      stop_hook_active: stopHookActive,
    };

    return this.executeHooks(HookEventName.AfterAgent, input);
  }

  /**
   * Fire a SessionStart event
   */
  async fireSessionStartEvent(
    source: SessionStartSource,
  ): Promise<AggregatedHookResult> {
    const input: SessionStartInput = {
      ...this.createBaseInput(HookEventName.SessionStart),
      source,
    };

    const context: HookEventContext = { trigger: source };
    return this.executeHooks(HookEventName.SessionStart, input, context);
  }

  /**
   * Fire a SessionEnd event
   */
  async fireSessionEndEvent(
    reason: SessionEndReason,
  ): Promise<AggregatedHookResult> {
    const input: SessionEndInput = {
      ...this.createBaseInput(HookEventName.SessionEnd),
      reason,
    };

    const context: HookEventContext = { trigger: reason };
    return this.executeHooks(HookEventName.SessionEnd, input, context);
  }

  /**
   * Fire a PreCompress event
   */
  async firePreCompressEvent(
    trigger: PreCompressTrigger,
  ): Promise<AggregatedHookResult> {
    const input: PreCompressInput = {
      ...this.createBaseInput(HookEventName.PreCompress),
      trigger,
    };

    const context: HookEventContext = { trigger };
    return this.executeHooks(HookEventName.PreCompress, input, context);
  }

  /**
   * Fire a BeforeModel event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireBeforeModelEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<AggregatedHookResult> {
    const input: BeforeModelInput = {
      ...this.createBaseInput(HookEventName.BeforeModel),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
    };

    return this.executeHooks(HookEventName.BeforeModel, input);
  }

  /**
   * Fire an AfterModel event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireAfterModelEvent(
    llmRequest: GenerateContentParameters,
    llmResponse: GenerateContentResponse,
  ): Promise<AggregatedHookResult> {
    const input: AfterModelInput = {
      ...this.createBaseInput(HookEventName.AfterModel),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
      llm_response: defaultHookTranslator.toHookLLMResponse(llmResponse),
    };

    return this.executeHooks(HookEventName.AfterModel, input);
  }

  /**
   * Fire a BeforeToolSelection event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireBeforeToolSelectionEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<AggregatedHookResult> {
    const input: BeforeToolSelectionInput = {
      ...this.createBaseInput(HookEventName.BeforeToolSelection),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
    };

    return this.executeHooks(HookEventName.BeforeToolSelection, input);
  }

  /**
   * Execute hooks for a specific event (direct execution without MessageBus)
   * Used as fallback when MessageBus is not available
   */
  private async executeHooks(
    eventName: HookEventName,
    input: HookInput,
    context?: HookEventContext,
  ): Promise<AggregatedHookResult> {
    try {
      // Create execution plan
      const plan = this.hookPlanner.createExecutionPlan(eventName, context);

      if (!plan || plan.hookConfigs.length === 0) {
        return {
          success: true,
          allOutputs: [],
          errors: [],
          totalDuration: 0,
        };
      }

      const onHookStart = (config: HookConfig, index: number) => {
        coreEvents.emitHookStart({
          hookName: this.getHookName(config),
          eventName,
          hookIndex: index + 1,
          totalHooks: plan.hookConfigs.length,
        });
      };

      const onHookEnd = (config: HookConfig, result: HookExecutionResult) => {
        coreEvents.emitHookEnd({
          hookName: this.getHookName(config),
          eventName,
          success: result.success,
        });
      };

      // Execute hooks according to the plan's strategy
      const results = plan.sequential
        ? await this.hookRunner.executeHooksSequential(
            plan.hookConfigs,
            eventName,
            input,
            onHookStart,
            onHookEnd,
          )
        : await this.hookRunner.executeHooksParallel(
            plan.hookConfigs,
            eventName,
            input,
            onHookStart,
            onHookEnd,
          );

      // Aggregate results
      const aggregated = this.hookAggregator.aggregateResults(
        results,
        eventName,
      );

      // Process common hook output fields centrally
      this.processCommonHookOutputFields(aggregated);

      // Log hook execution
      this.logHookExecution(eventName, input, results, aggregated);

      return aggregated;
    } catch (error) {
      debugLogger.error(`Hook event bus error for ${eventName}: ${error}`);

      return {
        success: false,
        allOutputs: [],
        errors: [error instanceof Error ? error : new Error(String(error))],
        totalDuration: 0,
      };
    }
  }

  /**
   * Create base hook input with common fields
   */
  private createBaseInput(eventName: HookEventName): HookInput {
    // Get the transcript path from the ChatRecordingService if available
    const transcriptPath =
      this.config
        .getGeminiClient()
        ?.getChatRecordingService()
        ?.getConversationFilePath() ?? '';

    return {
      session_id: this.config.getSessionId(),
      transcript_path: transcriptPath,
      cwd: this.config.getWorkingDir(),
      hook_event_name: eventName,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log hook execution for observability
   */
  private logHookExecution(
    eventName: HookEventName,
    input: HookInput,
    results: HookExecutionResult[],
    aggregated: AggregatedHookResult,
  ): void {
    const failedHooks = results.filter((r) => !r.success);
    const successCount = results.length - failedHooks.length;
    const errorCount = failedHooks.length;

    if (errorCount > 0) {
      const failedNames = failedHooks
        .map((r) => this.getHookNameFromResult(r))
        .join(', ');

      debugLogger.warn(
        `Hook execution for ${eventName}: ${successCount} succeeded, ${errorCount} failed (${failedNames}), ` +
          `total duration: ${aggregated.totalDuration}ms`,
      );

      coreEvents.emitFeedback(
        'warning',
        `Hook(s) [${failedNames}] failed for event ${eventName}. Press F12 to see the debug drawer for more details.\n`,
      );
    } else {
      debugLogger.debug(
        `Hook execution for ${eventName}: ${successCount} hooks executed successfully, ` +
          `total duration: ${aggregated.totalDuration}ms`,
      );
    }

    // Log individual hook calls to telemetry
    for (const result of results) {
      // Determine hook name and type for telemetry
      const hookName = this.getHookNameFromResult(result);
      const hookType = this.getHookTypeFromResult(result);

      const hookCallEvent = new HookCallEvent(
        eventName,
        hookType,
        hookName,
        { ...input },
        result.duration,
        result.success,
        result.output ? { ...result.output } : undefined,
        result.exitCode,
        result.stdout,
        result.stderr,
        result.error?.message,
      );

      logHookCall(this.config, hookCallEvent);
    }

    // Log individual errors
    for (const error of aggregated.errors) {
      debugLogger.warn(`Hook execution error: ${error.message}`);
    }
  }

  /**
   * Process common hook output fields centrally
   */
  private processCommonHookOutputFields(
    aggregated: AggregatedHookResult,
  ): void {
    if (!aggregated.finalOutput) {
      return;
    }

    // Handle systemMessage - show to user in transcript mode (not to agent)
    const systemMessage = aggregated.finalOutput.systemMessage;
    if (systemMessage && !aggregated.finalOutput.suppressOutput) {
      debugLogger.warn(`Hook system message: ${systemMessage}`);
    }

    // Handle suppressOutput - already handled by not logging above when true

    // Handle continue=false - this should stop the entire agent execution
    if (aggregated.finalOutput.shouldStopExecution()) {
      const stopReason = aggregated.finalOutput.getEffectiveReason();
      debugLogger.log(`Hook requested to stop execution: ${stopReason}`);

      // Note: The actual stopping of execution must be handled by integration points
      // as they need to interpret this signal in the context of their specific workflow
      // This is just logging the request centrally
    }

    // Other common fields like decision/reason are handled by specific hook output classes
  }

  /**
   * Get hook name from config for display or telemetry
   */
  private getHookName(config: HookConfig): string {
    return config.name || config.command || 'unknown-command';
  }

  /**
   * Get hook name from execution result for telemetry
   */
  private getHookNameFromResult(result: HookExecutionResult): string {
    return this.getHookName(result.hookConfig);
  }

  /**
   * Get hook type from execution result for telemetry
   */
  private getHookTypeFromResult(result: HookExecutionResult): 'command' {
    return result.hookConfig.type;
  }

  /**
   * Handle hook execution requests from MessageBus
   * This method routes the request to the appropriate fire*Event method
   * and publishes the response back through MessageBus
   *
   * The request input only contains event-specific fields. This method adds
   * the common base fields (session_id, cwd, etc.) before routing.
   */
  private async handleHookExecutionRequest(
    request: HookExecutionRequest,
  ): Promise<void> {
    try {
      // Add base fields to the input
      const enrichedInput = {
        ...this.createBaseInput(request.eventName as HookEventName),
        ...request.input,
      } as Record<string, unknown>;

      let result: AggregatedHookResult;

      // Route to appropriate event handler based on eventName
      switch (request.eventName) {
        case HookEventName.BeforeTool: {
          const { toolName, toolInput, mcpContext } =
            validateBeforeToolInput(enrichedInput);
          result = await this.fireBeforeToolEvent(
            toolName,
            toolInput,
            mcpContext,
          );
          break;
        }
        case HookEventName.AfterTool: {
          const { toolName, toolInput, toolResponse, mcpContext } =
            validateAfterToolInput(enrichedInput);
          result = await this.fireAfterToolEvent(
            toolName,
            toolInput,
            toolResponse,
            mcpContext,
          );
          break;
        }
        case HookEventName.BeforeAgent: {
          const { prompt } = validateBeforeAgentInput(enrichedInput);
          result = await this.fireBeforeAgentEvent(prompt);
          break;
        }
        case HookEventName.AfterAgent: {
          const { prompt, promptResponse, stopHookActive } =
            validateAfterAgentInput(enrichedInput);
          result = await this.fireAfterAgentEvent(
            prompt,
            promptResponse,
            stopHookActive,
          );
          break;
        }
        case HookEventName.BeforeModel: {
          const { llmRequest } = validateModelInput(
            enrichedInput,
            'BeforeModel',
          );
          const translatedRequest =
            defaultHookTranslator.toHookLLMRequest(llmRequest);
          // Update the enrichedInput with translated request
          enrichedInput['llm_request'] = translatedRequest;
          result = await this.fireBeforeModelEvent(llmRequest);
          break;
        }
        case HookEventName.AfterModel: {
          const { llmRequest, llmResponse } =
            validateAfterModelInput(enrichedInput);
          const translatedRequest =
            defaultHookTranslator.toHookLLMRequest(llmRequest);
          const translatedResponse =
            defaultHookTranslator.toHookLLMResponse(llmResponse);
          // Update the enrichedInput with translated versions
          enrichedInput['llm_request'] = translatedRequest;
          enrichedInput['llm_response'] = translatedResponse;
          result = await this.fireAfterModelEvent(llmRequest, llmResponse);
          break;
        }
        case HookEventName.BeforeToolSelection: {
          const { llmRequest } = validateModelInput(
            enrichedInput,
            'BeforeToolSelection',
          );
          const translatedRequest =
            defaultHookTranslator.toHookLLMRequest(llmRequest);
          // Update the enrichedInput with translated request
          enrichedInput['llm_request'] = translatedRequest;
          result = await this.fireBeforeToolSelectionEvent(llmRequest);
          break;
        }
        case HookEventName.Notification: {
          const { notificationType, message, details } =
            validateNotificationInput(enrichedInput);
          result = await this.fireNotificationEvent(
            notificationType,
            message,
            details,
          );
          break;
        }
        case HookEventName.SessionStart: {
          const { source } = validateSessionStartInput(enrichedInput);
          result = await this.fireSessionStartEvent(source);
          break;
        }
        case HookEventName.SessionEnd: {
          const { reason } = validateSessionEndInput(enrichedInput);
          result = await this.fireSessionEndEvent(reason);
          break;
        }
        case HookEventName.PreCompress: {
          const { trigger } = validatePreCompressInput(enrichedInput);
          result = await this.firePreCompressEvent(trigger);
          break;
        }
        default:
          throw new Error(`Unsupported hook event: ${request.eventName}`);
      }

      // Publish response through MessageBus
      if (this.messageBus) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.messageBus.publish({
          type: MessageBusType.HOOK_EXECUTION_RESPONSE,
          correlationId: request.correlationId,
          success: result.success,
          output: result.finalOutput as unknown as Record<string, unknown>,
        });
      }
    } catch (error) {
      // Publish error response
      if (this.messageBus) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.messageBus.publish({
          type: MessageBusType.HOOK_EXECUTION_RESPONSE,
          correlationId: request.correlationId,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }
}
