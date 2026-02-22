/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import type {
  AnyDeclarativeTool,
  AnyToolInvocation,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResultDisplay,
} from '../tools/tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { ToolErrorType } from '../tools/tool-error.js';
import type { SerializableConfirmationDetails } from '../confirmation-bus/types.js';
import { type ApprovalMode } from '../policy/types.js';

export const ROOT_SCHEDULER_ID = 'root';

/**
 * Internal core statuses for the tool call state machine.
 */
export enum CoreToolCallStatus {
  Validating = 'validating',
  Scheduled = 'scheduled',
  Error = 'error',
  Success = 'success',
  Executing = 'executing',
  Cancelled = 'cancelled',
  AwaitingApproval = 'awaiting_approval',
}

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  prompt_id: string;
  checkpoint?: string;
  traceId?: string;
  parentCallId?: string;
  schedulerId?: string;
}

export interface ToolCallResponseInfo {
  callId: string;
  responseParts: Part[];
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
  errorType: ToolErrorType | undefined;
  outputFile?: string | undefined;
  contentLength?: number;
  /**
   * Optional data payload for passing structured information back to the caller.
   */
  data?: Record<string, unknown>;
}

export type ValidatingToolCall = {
  status: CoreToolCallStatus.Validating;
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type ScheduledToolCall = {
  status: CoreToolCallStatus.Scheduled;
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type ErroredToolCall = {
  status: CoreToolCallStatus.Error;
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool?: AnyDeclarativeTool;
  durationMs?: number;
  startTime?: number;
  endTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type SuccessfulToolCall = {
  status: CoreToolCallStatus.Success;
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  response: ToolCallResponseInfo;
  invocation: AnyToolInvocation;
  durationMs?: number;
  startTime?: number;
  endTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type ExecutingToolCall = {
  status: CoreToolCallStatus.Executing;
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  liveOutput?: string | AnsiOutput;
  progressMessage?: string;
  progressPercent?: number;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  pid?: number;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type CancelledToolCall = {
  status: CoreToolCallStatus.Cancelled;
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  durationMs?: number;
  startTime?: number;
  endTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type WaitingToolCall = {
  status: CoreToolCallStatus.AwaitingApproval;
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  /**
   * Supports both legacy (with callbacks) and new (serializable) details.
   * New code should treat this as SerializableConfirmationDetails.
   *
   * TODO: Remove ToolCallConfirmationDetails and collapse to just
   * SerializableConfirmationDetails after migration.
   */
  confirmationDetails:
    | ToolCallConfirmationDetails
    | SerializableConfirmationDetails;
  // TODO: Make required after migration.
  correlationId?: string;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  schedulerId?: string;
  approvalMode?: ApprovalMode;
};

export type Status = ToolCall['status'];

export type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall;

export type CompletedToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

export type ConfirmHandler = (
  toolCall: WaitingToolCall,
) => Promise<ToolConfirmationOutcome>;

export type OutputUpdateHandler = (
  toolCallId: string,
  outputChunk: string | AnsiOutput,
) => void;

export type AllToolCallsCompleteHandler = (
  completedToolCalls: CompletedToolCall[],
) => Promise<void>;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;
