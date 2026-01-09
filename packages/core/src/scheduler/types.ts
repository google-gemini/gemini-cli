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

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  prompt_id: string;
  checkpoint?: string;
  traceId?: string;
}

export interface ToolCallResponseInfo {
  callId: string;
  responseParts: Part[];
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
  errorType: ToolErrorType | undefined;
  outputFile?: string | undefined;
  contentLength?: number;
}

export interface InputModificationInfo {
  wasModified: boolean;
  modifiedKeys: string[];
}

export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool?: AnyDeclarativeTool;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  response: ToolCallResponseInfo;
  invocation: AnyToolInvocation;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  liveOutput?: string | AnsiOutput;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  pid?: number;
  inputModification?: InputModificationInfo;
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  confirmationDetails: ToolCallConfirmationDetails;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  inputModification?: InputModificationInfo;
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
