/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';

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
}

export interface ToolConfirmationRequest {
  type: MessageBusType.TOOL_CONFIRMATION_REQUEST;
  toolCall: FunctionCall;
  correlationId: string;
  serverName?: string;
  /**
   * Tool-specific confirmation details for rendering the standard confirmation UI.
   * When provided, the parent UI should use ToolConfirmationMessage instead of
   * a generic text prompt.
   * Note: This is a simplified serializable version of ToolCallConfirmationDetails,
   * since function callbacks cannot be serialized through MessageBus.
   */
  confirmationDetails?: SerializableToolConfirmationDetails;
}

/**
 * Serializable version of ToolCallConfirmationDetails for MessageBus transport.
 * Discriminated union matching the original ToolCallConfirmationDetails structure.
 */
export type SerializableToolConfirmationDetails =
  | SerializableEditConfirmationDetails
  | SerializableExecConfirmationDetails
  | SerializableMcpConfirmationDetails
  | SerializableInfoConfirmationDetails;

export interface SerializableEditConfirmationDetails {
  type: 'edit';
  title: string;
  fileName: string;
  filePath: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
  isModifying?: boolean;
}

export interface SerializableExecConfirmationDetails {
  type: 'exec';
  title: string;
  command: string;
  rootCommand: string;
}

export interface SerializableMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
}

export interface SerializableInfoConfirmationDetails {
  type: 'info';
  title: string;
  prompt: string;
  urls?: string[];
}

export interface ToolConfirmationResponse {
  type: MessageBusType.TOOL_CONFIRMATION_RESPONSE;
  correlationId: string;
  confirmed: boolean;
  /**
   * When true, indicates that policy decision was ASK_USER and the tool should
   * show its legacy confirmation UI instead of auto-proceeding.
   */
  requiresUserConfirmation?: boolean;
}

export interface UpdatePolicy {
  type: MessageBusType.UPDATE_POLICY;
  toolName: string;
  persist?: boolean;
  argsPattern?: string;
  commandPrefix?: string;
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
  | HookPolicyDecision;
