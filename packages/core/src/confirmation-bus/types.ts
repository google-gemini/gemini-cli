/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';
import { type ApprovalMode } from '../policy/types.js';
import type {
  ToolConfirmationOutcome,
  ToolConfirmationPayload,
  DiffStat,
} from '../tools/tools.js';
import type { ToolCall } from '../scheduler/types.js';
import type { SandboxPermissions } from '../services/sandboxManager.js';
import type { SubagentActivityItem } from '../agents/types.js';

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
  SUBAGENT_ACTIVITY = 'subagent-activity',
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
   * Optional tool annotations (e.g., readOnlyHint, destructiveHint) from MCP.
   */
  toolAnnotations?: Record<string, unknown>;
  /**
   * Optional subagent name, if this tool call was initiated by a subagent.
   */
  subagent?: string;
  /**
   * Optional rich details for the confirmation UI (diffs, counts, etc.)
   */
  details?: SerializableConfirmationDetails;
  /**
   * Optional decision to force for this tool call, bypassing the policy engine.
   */
  forcedDecision?: 'allow' | 'deny' | 'ask_user';
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
  | {
      type: 'sandbox_expansion';
      title: string;
      command: string;
      rootCommand: string;
      additionalPermissions: SandboxPermissions;
      systemMessage?: string;
    }
  | {
      type: 'info';
      title: string;
      systemMessage?: string;
      prompt: string;
      urls?: string[];
    }
  | {
      type: 'edit';
      title: string;
      systemMessage?: string;
      fileName: string;
      filePath: string;
      fileDiff: string;
      originalContent: string | null;
      newContent: string;
      isModifying?: boolean;
      diffStat?: DiffStat;
    }
  | {
      type: 'exec';
      title: string;
      systemMessage?: string;
      command: string;
      rootCommand: string;
      rootCommands: string[];
      commands?: string[];
    }
  | {
      type: 'mcp';
      title: string;
      systemMessage?: string;
      serverName: string;
      toolName: string;
      toolDisplayName: string;
      toolArgs?: Record<string, unknown>;
      toolDescription?: string;
      toolParameterSchema?: unknown;
    }
  | {
      type: 'ask_user';
      title: string;
      systemMessage?: string;
      questions: Question[];
    }
  | {
      type: 'exit_plan_mode';
      title: string;
      systemMessage?: string;
      planPath: string;
    };

export interface UpdatePolicy {
  type: MessageBusType.UPDATE_POLICY;
  toolName: string;
  persist?: boolean;
  persistScope?: 'workspace' | 'user';
  argsPattern?: string;
  commandPrefix?: string | string[];
  mcpName?: string;
  allowRedirection?: boolean;
  modes?: ApprovalMode[];
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
  /** Question type: 'choice' renders selectable options, 'text' renders free-form input, 'yesno' renders a Yes/No choice with an optional 'Other' feedback field. */
  type: QuestionType;
  /** Selectable choices. REQUIRED when type='choice'. IGNORED for 'text' and 'yesno'. */
  options?: QuestionOption[];
  /** Allow multiple selections. Only applies when type='choice'. */
  multiSelect?: boolean;
  /** Placeholder hint text. For type='text', shown in the input field. For type='choice' and 'yesno', shown in the 'Other' custom input. */
  placeholder?: string;
  /** Allow the question to consume more vertical space instead of being strictly capped. */
  unconstrainedHeight?: boolean;
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

export interface SubagentActivityMessage {
  type: MessageBusType.SUBAGENT_ACTIVITY;
  subagentName: string;
  activity: SubagentActivityItem;
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
  | ToolCallsUpdateMessage
  | SubagentActivityMessage;
