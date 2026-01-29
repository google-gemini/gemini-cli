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
  TOOL_CALLS_UPDATE = 'tool-calls-update',
  ASK_USER_REQUEST = 'ask-user-request',
  ASK_USER_RESPONSE = 'ask-user-response',
}

export interface ToolCallsUpdateMessage {
  type: MessageBusType.TOOL_CALLS_UPDATE;
  toolCalls: ToolCall[];
  schedulerId: string;
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
 * Common optional properties for all confirmation details types.
 */
interface BaseConfirmationDetails {
  /** When true, hides the tool identity (name/description) in the confirmation UI */
  hideToolIdentity?: boolean;
}

/**
 * Data-only versions of ToolCallConfirmationDetails for bus transmission.
 */
export type SerializableConfirmationDetails =
  | (BaseConfirmationDetails & {
      type: 'info';
      title: string;
      prompt: string;
      urls?: string[];
    })
  | (BaseConfirmationDetails & {
      type: 'edit';
      title: string;
      fileName: string;
      filePath: string;
      fileDiff: string;
      originalContent: string | null;
      newContent: string;
      isModifying?: boolean;
    })
  | (BaseConfirmationDetails & {
      type: 'exec';
      title: string;
      command: string;
      rootCommand: string;
      rootCommands: string[];
      commands?: string[];
    })
  | (BaseConfirmationDetails & {
      type: 'mcp';
      title: string;
      serverName: string;
      toolName: string;
      toolDisplayName: string;
    })
  | (BaseConfirmationDetails & {
      type: 'ask_user';
      title: string;
      questions: Question[];
    });

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

export interface QuestionOption {
  label: string;
  description: string;
}

export enum QuestionType {
  CHOICE = 'choice',
  TEXT = 'text',
  YESNO = 'yesno',
}

export interface Question {
  question: string;
  header: string;
  /** Question type: 'choice' renders selectable options, 'text' renders free-form input, 'yesno' renders a binary Yes/No choice. Defaults to 'choice'. */
  type?: QuestionType;
  /** Selectable choices. REQUIRED when type='choice' or omitted. IGNORED for 'text' and 'yesno'. */
  options?: QuestionOption[];
  /** Allow multiple selections. Only applies when type='choice'. */
  multiSelect?: boolean;
  /** Placeholder hint text. Only applies when type='text'. */
  placeholder?: string;
}

export interface AskUserRequest {
  type: MessageBusType.ASK_USER_REQUEST;
  questions: Question[];
  correlationId: string;
}

export interface AskUserResponse {
  type: MessageBusType.ASK_USER_RESPONSE;
  correlationId: string;
  answers: { [questionIndex: string]: string };
  /** When true, indicates the user cancelled the dialog without submitting answers */
  cancelled?: boolean;
}

export type Message =
  | ToolConfirmationRequest
  | ToolConfirmationResponse
  | ToolPolicyRejection
  | ToolExecutionSuccess
  | ToolExecutionFailure
  | UpdatePolicy
  | AskUserRequest
  | AskUserResponse
  | ToolCallsUpdateMessage;
