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
} {
  const toolName = input['tool_name'];
  const toolInput = input['tool_input'];
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
  return { toolName, toolInput };
}

/**
 * Validates AfterTool input fields
 */
function validateAfterToolInput(input: Record<string, unknown>): {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResponse: Record<string, unknown>;
} {
  const toolName = input['tool_name'];
  const toolInput = input['tool_input'];
  const toolResponse = input['tool_response'];
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
  return { toolName, toolInput, toolResponse };
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
 * Hook event bus that coordinates hook execution across the system
 */
export class HookEventHandler {
  private readonly config: Config;
  private readonly hookPlanner: HookPlanner;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly messageBus?: MessageBus;

  constructor(
    config: Config,
    logger: Logger,
    hookPlanner: HookPlanner,
    hookRunner: HookRunner,
    hookAggregator: HookAggregator,
    messageBus?: MessageBus,
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
  ): Promise<AggregatedHookResult> {
    const input: BeforeToolInput = {
      ...this.createBaseInput(HookEventName.BeforeTool),
      tool_name: toolName,
      tool_input: toolInput,
    };

    const context: HookEventContext = { toolName };
    return await this.executeHooks(HookEventName.BeforeTool, input, context);
  }

  /**
   * Fire an AfterTool event
   * Called by handleHookExecutionRequest - executes hooks directly
   */
  async fireAfterToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: Record<string, unknown>,
  ): Promise<AggregatedHookResult> {
    const input: AfterToolInput = {
      ...this.createBaseInput(HookEventName.AfterTool),
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
    };

    const context: HookEventContext = { toolName };
    return await this.executeHooks(HookEventName.AfterTool, input, context);
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

    return await this.executeHooks(HookEventName.BeforeAgent, input);
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

    return await this.executeHooks(HookEventName.Notification, input);
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

    return await this.executeHooks(HookEventName.AfterAgent, input);
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
    return await this.executeHooks(HookEventName.SessionStart, input, context);
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
    return await this.executeHooks(HookEventName.SessionEnd, input, context);
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
    return await this.executeHooks(HookEventName.PreCompress, input, context);
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

    return await this.executeHooks(HookEventName.BeforeModel, input);
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

    return await this.executeHooks(HookEventName.AfterModel, input);
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

    return await this.executeHooks(HookEventName.BeforeToolSelection, input);
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

      // Execute hooks according to the plan's strategy
      const results = plan.sequential
        ? await this.hookRunner.executeHooksSequential(
            plan.hookConfigs,
            eventName,
            input,
          )
        : await this.hookRunner.executeHooksParallel(
            plan.hookConfigs,
            eventName,
            input,
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
    return {
      session_id: this.config.getSessionId(),
      transcript_path: '', // TODO: Implement transcript path when supported
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
    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.length - successCount;

    if (errorCount > 0) {
      debugLogger.warn(
        `Hook execution for ${eventName}: ${successCount} succeeded, ${errorCount} failed, ` +
          `total duration: ${aggregated.totalDuration}ms`,
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
      debugLogger.error(`Hook execution error: ${error.message}`);
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
   * Get hook name from execution result for telemetry
   */
  private getHookNameFromResult(result: HookExecutionResult): string {
    return result.hookConfig.command || 'unknown-command';
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
          const { toolName, toolInput } =
            validateBeforeToolInput(enrichedInput);
          result = await this.fireBeforeToolEvent(toolName, toolInput);
          break;
        }
        case HookEventName.AfterTool: {
          const { toolName, toolInput, toolResponse } =
            validateAfterToolInput(enrichedInput);
          result = await this.fireAfterToolEvent(
            toolName,
            toolInput,
            toolResponse,
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
        default:
          throw new Error(`Unsupported hook event: ${request.eventName}`);
      }

      // Publish response through MessageBus
      if (this.messageBus) {
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
