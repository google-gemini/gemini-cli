/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  EditorType,
  CompletedToolCall,
  ToolCallRequestInfo,
} from '@google/gemini-cli-core';
import {
  type TrackedScheduledToolCall,
  type TrackedValidatingToolCall,
  type TrackedWaitingToolCall,
  type TrackedExecutingToolCall,
  type TrackedCompletedToolCall,
  type TrackedCancelledToolCall,
  type MarkToolsAsSubmittedFn,
  type CancelAllFn,
} from './useReactToolScheduler.js';
import {
  useToolExecutionScheduler,
  type TrackedToolCall,
} from './useToolExecutionScheduler.js';

// Re-export specific state types from Legacy, as the structures are compatible
// and useGeminiStream relies on them for narrowing.
export type {
  TrackedToolCall,
  TrackedScheduledToolCall,
  TrackedValidatingToolCall,
  TrackedWaitingToolCall,
  TrackedExecutingToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
  MarkToolsAsSubmittedFn,
  CancelAllFn,
};

// Unified Schedule function (Promise<void> | Promise<CompletedToolCall[]>)
export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => Promise<void | CompletedToolCall[]>;

export type UseToolSchedulerReturn = [
  TrackedToolCall[],
  ScheduleFn,
  MarkToolsAsSubmittedFn,
  React.Dispatch<React.SetStateAction<TrackedToolCall[]>>,
  CancelAllFn,
  number,
];

/**
 * Hook that uses the Event-Driven scheduler for tool execution.
 */
export function useToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => Promise<void>,
  config: Config,
  getPreferredEditor: () => EditorType | undefined,
): UseToolSchedulerReturn {
  return useToolExecutionScheduler(
    onComplete,
    config,
    getPreferredEditor,
  ) as UseToolSchedulerReturn;
}
