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
  useReactToolScheduler,
  type TrackedToolCall as LegacyTrackedToolCall,
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
  type TrackedToolCall as NewTrackedToolCall,
} from './useToolExecutionScheduler.js';

// Re-export specific state types from Legacy, as the structures are compatible
// and useGeminiStream relies on them for narrowing.
export type {
  TrackedScheduledToolCall,
  TrackedValidatingToolCall,
  TrackedWaitingToolCall,
  TrackedExecutingToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
  MarkToolsAsSubmittedFn,
  CancelAllFn,
};

// Unified type that covers both implementations
export type TrackedToolCall = LegacyTrackedToolCall | NewTrackedToolCall;

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
 * Facade hook that switches between the Legacy and Event-Driven schedulers
 * based on configuration.
 *
 * Note: This conditionally calls hooks, which technically violates the standard
 * Rules of Hooks linting. However, this is safe here because
 * `config.isEventDrivenSchedulerEnabled()` is static for the lifetime of the
 * application session (it essentially acts as a compile-time feature flag).
 */
export function useToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => Promise<void>,
  config: Config,
  getPreferredEditor: () => EditorType | undefined,
): UseToolSchedulerReturn {
  const isEventDriven = config.isEventDrivenSchedulerEnabled();

  // Note: We return the hooks directly without casting. They return compatible
  // tuple structures, but use explicit tuple signatures rather than the
  // UseToolSchedulerReturn named type to avoid circular dependencies back to
  // this facade.
  if (isEventDriven) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useToolExecutionScheduler(onComplete, config, getPreferredEditor);
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useReactToolScheduler(onComplete, config, getPreferredEditor);
}
