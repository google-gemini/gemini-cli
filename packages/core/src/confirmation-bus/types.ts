/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';
import type {
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
} from '../tools/tools.js';
import type { ToolCall } from '../scheduler/types.js';

export enum MessageBusType {
  TOOL_CONFIRMATION_REQUEST = 'tool-confirmation-request',
  TOOL_CONFIRMATION_RESPONSE = 'tool-confirmation-response',
  TOOL_POLICY_REJECTION = 'tool-policy-rejection',
  TOOL_EXECUTION_SUCCESS = 'tool-execution-success',
  TOOL_EXECUTION_FAILURE = 'tool-execution-failure',
  UPDATE_POLICY = 'update-policy',
  HOOK_EXECUTION_REQUEST = 'hook-execution-request',
  HOOK_EXECUTION_RESPONSE = 'hook-execution-response',
  HOOK_POLICY_DECISION = 'hook-policy-decision',
  TOOL_CALLS_UPDATE = 'tool-calls-update',
}

export interface ToolCallsUpdateMessage {
  type: MessageBusType.TOOL_CALLS_UPDATE;
  toolCalls: ToolCall[];
}

export interface ToolConfirmationRequest {
  type: MessageBusType.TOOL_CONFIRMATION_REQUEST;
  toolCall: FunctionCall;
  correlationId: string;
  serverName?: string;
  /**
   * Optional rich details for the confirmation UI (diffs, counts, etc.)
   */
  details?: SerializableConfirmationDetails;
}

export interface ToolConfirmationResponse {
  type: MessageBusType.TOOL_CONFIRMATION_RESPONSE;
  correlationId: string;
  confirmed: boolean;
  /**
   * The specific outcome selected by the user.
   *
   * TODO: Make required after migration.
   */
  outcome?: ToolConfirmationOutcome;
  /**
   * Optional payload (e.g., modified content for 'modify_with_editor').
   */
  payload?: ToolConfirmationPayload;
  /**
   * When true, indicates that policy decision was ASK_USER and the tool should
   * show its legacy confirmation UI instead of auto-proceeding.
   */
  requiresUserConfirmation?: boolean;
}

/**
 * Data-only versions of ToolCallConfirmationDetails for bus transmission.
 */
export type SerializableConfirmationDetails =
  | { type: 'info'; title: string; prompt: string; urls?: string[] }
  | {
      type: 'edit';
      title: string;
      fileName: string;
      filePath: string;
      fileDiff: string;
      originalContent: string | null;
      newContent: string;
    }
  | {
      type: 'exec';
      title: string;
      command: string;
      rootCommand: string;
      rootCommands: string[];
    }
  | {
      type: 'mcp';
      title: string;
      serverName: string;
      toolName: string;
      toolDisplayName: string;
    };

export interface UpdatePolicy {
  type: MessageBusType.UPDATE_POLICY;
  toolName: string;
  persist?: boolean;
  argsPattern?: string;
  commandPrefix?: string | string[];
  mcpName?: string;
}

export interface ToolPolicyRejection {
  type: MessageBusType.TOOL_POLICY_REJECTION;
  toolCall: FunctionCall;
}

export interface ToolExecutionSuccess<T = unknown> {
  type: MessageBusType.TOOL_EXECUTION_SUCCESS;
  toolCall: FunctionCall;
  result: T;
}

export interface ToolExecutionFailure<E = Error> {
  type: MessageBusType.TOOL_EXECUTION_FAILURE;
  toolCall: FunctionCall;
  error: E;
}

export interface HookExecutionRequest {
  type: MessageBusType.HOOK_EXECUTION_REQUEST;
  eventName: string;
  input: Record<string, unknown>;
  correlationId: string;
}

export interface HookExecutionResponse {
  type: MessageBusType.HOOK_EXECUTION_RESPONSE;
  correlationId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: Error;
}

export interface HookPolicyDecision {
  type: MessageBusType.HOOK_POLICY_DECISION;
  eventName: string;
  hookSource: 'project' | 'user' | 'system' | 'extension';
  decision: 'allow' | 'deny';
  reason?: string;
}

export type Message =
  | ToolConfirmationRequest
  | ToolConfirmationResponse
  | ToolPolicyRejection
  | ToolExecutionSuccess
  | ToolExecutionFailure
  | UpdatePolicy
  | HookExecutionRequest
  | HookExecutionResponse
  | HookPolicyDecision
  | ToolCallsUpdateMessage;
