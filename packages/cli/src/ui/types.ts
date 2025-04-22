/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallConfirmationDetails,
  ToolResultDisplay,
} from '@gemini-code/server';

// Only defining the state enum needed by the UI
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
}

// Copied from server/src/core/turn.ts for CLI usage
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  // Add other event types if the UI hook needs to handle them
}

export enum ToolCallStatus {
  Pending = 'Pending',
  Canceled = 'Canceled',
  Confirming = 'Confirming',
  Success = 'Success',
  Error = 'Error',
}

export interface ToolCallEvent {
  type: 'tool_call';
  status: ToolCallStatus;
  callId: string;
  name: string;
  args: Record<string, never>;
  resultDisplay: ToolResultDisplay | undefined;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface IndividualToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: ToolCallStatus;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface HistoryItemBase {
  id: number;
  text?: string; // Text content for user/gemini/info/error messages
}

export type HistoryItem = HistoryItemBase &
  (
    | { type: 'user'; text: string }
    | { type: 'gemini'; text: string }
    | { type: 'info'; text: string }
    | { type: 'error'; text: string }
    | { type: 'tool_group'; tools: IndividualToolCallDisplay[] }
  );
