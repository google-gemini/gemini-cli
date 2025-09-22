/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  ToolConfig as GenAIToolConfig,
  ToolListUnion,
} from '@google/genai';
import type { Logger } from '@opentelemetry/api-logs';
import type { Config, HookConfig, HookEventName } from '../config/config.js';
import type {
  LLMRequest,
  LLMResponse,
  HookToolConfig,
} from './hookTranslator.js';
import { defaultHookTranslator } from './hookTranslator.js';

export type ApiVersion = '1.0';

/**
 * Decision types for hook outputs
 */
export type HookDecision =
  | 'ask'
  | 'block'
  | 'deny'
  | 'approve'
  | 'allow'
  | undefined;

/**
 * Services injected into plugins
 */
export interface Services {
  logger: Logger;
  config: Config;
  http: HttpClient;
}

/**
 * HTTP client interface for plugins
 */
export interface HttpClient {
  get(url: string, options?: RequestInit): Promise<Response>;
  post(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
  put(url: string, body?: unknown, options?: RequestInit): Promise<Response>;
  delete(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Base hook input - common fields for all events
 */
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  timestamp: string;
}

/**
 * Base hook output - common fields for all events
 */
export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  decision?: HookDecision;
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}

/**
 * Default implementation of HookOutput with utility methods
 */
export class DefaultHookOutput implements HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  decision?: HookDecision;
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;

  constructor(data: Partial<HookOutput> = {}) {
    this.continue = data.continue;
    this.stopReason = data.stopReason;
    this.suppressOutput = data.suppressOutput;
    this.systemMessage = data.systemMessage;
    this.decision = data.decision;
    this.reason = data.reason;
    this.hookSpecificOutput = data.hookSpecificOutput;
  }

  /**
   * Check if this output represents a blocking decision
   */
  isBlockingDecision(): boolean {
    return this.decision === 'block' || this.decision === 'deny';
  }

  /**
   * Check if this output requests to stop execution
   */
  shouldStopExecution(): boolean {
    return this.continue === false;
  }

  /**
   * Get the effective reason for blocking or stopping
   */
  getEffectiveReason(): string {
    return this.reason || this.stopReason || 'No reason provided';
  }

  /**
   * Apply LLM request modifications (specific method for BeforeModel hooks)
   */
  applyLLMRequestModifications(
    target: GenerateContentParameters,
  ): GenerateContentParameters {
    // Base implementation - overridden by BeforeModelHookOutput
    return target;
  }

  /**
   * Apply tool config modifications (specific method for BeforeToolSelection hooks)
   */
  applyToolConfigModifications(target: {
    toolConfig?: GenAIToolConfig;
    tools?: ToolListUnion;
  }): {
    toolConfig?: GenAIToolConfig;
    tools?: ToolListUnion;
  } {
    // Base implementation - overridden by BeforeToolSelectionHookOutput
    return target;
  }

  /**
   * Get additional context for adding to responses
   */
  getAdditionalContext(): string | undefined {
    if (
      this.hookSpecificOutput &&
      'additionalContext' in this.hookSpecificOutput
    ) {
      const context = this.hookSpecificOutput['additionalContext'];
      return typeof context === 'string' ? context : undefined;
    }
    return undefined;
  }

  /**
   * Check if execution should be blocked and return error info
   */
  getBlockingError(): { blocked: boolean; reason: string } {
    if (this.isBlockingDecision()) {
      return {
        blocked: true,
        reason: this.getEffectiveReason(),
      };
    }
    return { blocked: false, reason: '' };
  }
}

/**
 * Specific hook output class for BeforeTool events with compatibility support
 */
export class BeforeToolHookOutput extends DefaultHookOutput {
  /**
   * Get the effective blocking reason, considering compatibility fields
   */
  override getEffectiveReason(): string {
    // Check for compatibility fields first
    if (this.hookSpecificOutput) {
      if ('permissionDecisionReason' in this.hookSpecificOutput) {
        const compatReason =
          this.hookSpecificOutput['permissionDecisionReason'];
        if (typeof compatReason === 'string') {
          return compatReason;
        }
      }
    }

    return super.getEffectiveReason();
  }

  /**
   * Check if this output represents a blocking decision, considering compatibility fields
   */
  override isBlockingDecision(): boolean {
    // Check compatibility field first
    if (
      this.hookSpecificOutput &&
      'permissionDecision' in this.hookSpecificOutput
    ) {
      const compatDecision = this.hookSpecificOutput['permissionDecision'];
      if (compatDecision === 'block' || compatDecision === 'deny') {
        return true;
      }
    }

    return super.isBlockingDecision();
  }
}

/**
 * Specific hook output class for BeforeModel events
 */
export class BeforeModelHookOutput extends DefaultHookOutput {
  /**
   * Get synthetic LLM response if provided by hook
   */
  getSyntheticResponse(): GenerateContentResponse | undefined {
    if (this.hookSpecificOutput && 'llm_response' in this.hookSpecificOutput) {
      const hookResponse = this.hookSpecificOutput[
        'llm_response'
      ] as LLMResponse;
      if (hookResponse) {
        // Convert hook format to SDK format
        return defaultHookTranslator.fromHookLLMResponse(hookResponse);
      }
    }
    return undefined;
  }

  /**
   * Apply modifications to LLM request
   */
  override applyLLMRequestModifications(
    target: GenerateContentParameters,
  ): GenerateContentParameters {
    if (this.hookSpecificOutput && 'llm_request' in this.hookSpecificOutput) {
      const hookRequest = this.hookSpecificOutput[
        'llm_request'
      ] as Partial<LLMRequest>;
      if (hookRequest) {
        // Convert hook format to SDK format
        const sdkRequest = defaultHookTranslator.fromHookLLMRequest(
          hookRequest as LLMRequest,
          target,
        );
        return {
          ...target,
          ...sdkRequest,
        };
      }
    }
    return target;
  }
}

/**
 * Specific hook output class for BeforeToolSelection events
 */
export class BeforeToolSelectionHookOutput extends DefaultHookOutput {
  /**
   * Apply tool configuration modifications
   */
  override applyToolConfigModifications(target: {
    toolConfig?: GenAIToolConfig;
    tools?: ToolListUnion;
  }): { toolConfig?: GenAIToolConfig; tools?: ToolListUnion } {
    if (this.hookSpecificOutput && 'toolConfig' in this.hookSpecificOutput) {
      const hookToolConfig = this.hookSpecificOutput[
        'toolConfig'
      ] as HookToolConfig;
      if (hookToolConfig) {
        // Convert hook format to SDK format
        const sdkToolConfig =
          defaultHookTranslator.fromHookToolConfig(hookToolConfig);
        return {
          ...target,
          tools: target.tools || [],
          toolConfig: sdkToolConfig,
        };
      }
    }
    return target;
  }
}

/**
 * Specific hook output class for AfterModel events
 */
export class AfterModelHookOutput extends DefaultHookOutput {
  /**
   * Get modified LLM response if provided by hook
   */
  getModifiedResponse(): GenerateContentResponse | undefined {
    if (this.hookSpecificOutput && 'llm_response' in this.hookSpecificOutput) {
      const hookResponse = this.hookSpecificOutput[
        'llm_response'
      ] as Partial<LLMResponse>;
      if (hookResponse?.candidates?.[0]?.content) {
        // Convert hook format to SDK format
        return defaultHookTranslator.fromHookLLMResponse(
          hookResponse as LLMResponse,
        );
      }
    }

    // If hook wants to stop execution, create a synthetic stop response
    if (this.shouldStopExecution()) {
      const stopResponse: LLMResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text:
                    this.getEffectiveReason() || 'Execution stopped by hook',
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      };
      return defaultHookTranslator.fromHookLLMResponse(stopResponse);
    }

    return undefined;
  }
}

/**
 * BeforeTool hook input
 */
export interface BeforeToolInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/**
 * BeforeTool hook output
 */
export interface BeforeToolOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'BeforeTool';
    permissionDecision?: HookDecision;
    permissionDecisionReason?: string;
  };
}

/**
 * AfterTool hook input
 */
export interface AfterToolInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
}

/**
 * AfterTool hook output
 */
export interface AfterToolOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'AfterTool';
    additionalContext?: string;
  };
}

/**
 * BeforeAgent hook input
 */
export interface BeforeAgentInput extends HookInput {
  prompt: string;
}

/**
 * BeforeAgent hook output
 */
export interface BeforeAgentOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'BeforeAgent';
    additionalContext?: string;
  };
}

/**
 * Notification types
 */
export enum NotificationType {
  ToolPermission = 'ToolPermission',
}

/**
 * Notification hook input
 */
export interface NotificationInput extends HookInput {
  notification_type: NotificationType;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Notification hook output
 */
export interface NotificationOutput {
  suppressOutput?: boolean;
  systemMessage?: string;
}

/**
 * AfterAgent hook input
 */
export interface AfterAgentInput extends HookInput {
  prompt: string;
  prompt_response: string;
  stop_hook_active: boolean;
}

/**
 * SessionStart source types
 */
export enum SessionStartSource {
  Startup = 'startup',
  Resume = 'resume',
  Clear = 'clear',
  Compress = 'compress',
}

/**
 * SessionStart hook input
 */
export interface SessionStartInput extends HookInput {
  source: SessionStartSource;
}

/**
 * SessionStart hook output
 */
export interface SessionStartOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'SessionStart';
    additionalContext?: string;
  };
}

/**
 * SessionEnd reason types
 */
export enum SessionEndReason {
  Exit = 'exit',
  Clear = 'clear',
  Logout = 'logout',
  PromptInputExit = 'prompt_input_exit',
  Other = 'other',
}

/**
 * SessionEnd hook input
 */
export interface SessionEndInput extends HookInput {
  reason: SessionEndReason;
}

/**
 * PreCompress trigger types
 */
export enum PreCompressTrigger {
  Manual = 'manual',
  Auto = 'auto',
}

/**
 * PreCompress hook input
 */
export interface PreCompressInput extends HookInput {
  trigger: PreCompressTrigger;
}

/**
 * PreCompress hook output
 */
export interface PreCompressOutput {
  suppressOutput?: boolean;
  systemMessage?: string;
}

/**
 * BeforeModel hook input - uses decoupled types
 */
export interface BeforeModelInput extends HookInput {
  llm_request: LLMRequest;
}

/**
 * BeforeModel hook output
 */
export interface BeforeModelOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'BeforeModel';
    llm_request?: Partial<LLMRequest>;
    llm_response?: LLMResponse;
  };
}

/**
 * AfterModel hook input - uses decoupled types
 */
export interface AfterModelInput extends HookInput {
  llm_request: LLMRequest;
  llm_response: LLMResponse;
}

/**
 * AfterModel hook output
 */
export interface AfterModelOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'AfterModel';
    llm_response?: Partial<LLMResponse>;
  };
}

/**
 * BeforeToolSelection hook input - uses decoupled types
 */
export interface BeforeToolSelectionInput extends HookInput {
  llm_request: LLMRequest;
}

/**
 * BeforeToolSelection hook output
 */
export interface BeforeToolSelectionOutput extends HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'BeforeToolSelection';
    toolConfig?: HookToolConfig;
  };
}

/**
 * Plugin interface that all hook plugins must implement
 */
export interface Plugin {
  apiVersion: ApiVersion;
  name: string;
  activate(services: Services): Promise<void> | void;
  deactivate?(services: Services): Promise<void> | void;
  hooks: {
    beforeTool?(args: BeforeToolInput): Promise<BeforeToolOutput>;
    afterTool?(args: AfterToolInput): Promise<AfterToolOutput>;
    beforeAgent?(args: BeforeAgentInput): Promise<BeforeAgentOutput>;
    notification?(args: NotificationInput): Promise<NotificationOutput>;
    afterAgent?(args: AfterAgentInput): Promise<HookOutput>;
    sessionStart?(args: SessionStartInput): Promise<SessionStartOutput>;
    sessionEnd?(args: SessionEndInput): Promise<void>;
    preCompress?(args: PreCompressInput): Promise<PreCompressOutput>;
    beforeModel?(args: BeforeModelInput): Promise<BeforeModelOutput>;
    afterModel?(args: AfterModelInput): Promise<AfterModelOutput>;
    beforeToolSelection?(
      args: BeforeToolSelectionInput,
    ): Promise<BeforeToolSelectionOutput>;
  };
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  hookConfig: HookConfig;
  eventName: HookEventName;
  success: boolean;
  output?: HookOutput;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  duration: number;
  error?: Error;
}

/**
 * Hook execution plan for an event
 */
export interface HookExecutionPlan {
  eventName: HookEventName;
  hookConfigs: HookConfig[];
  sequential: boolean;
}
