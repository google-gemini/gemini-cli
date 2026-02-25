/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HookEventName,
  HookOutput,
  BeforeToolInput,
  AfterToolInput,
  BeforeAgentInput,
  AfterAgentInput,
  BeforeModelInput,
  BeforeModelOutput,
  AfterModelInput,
  AfterModelOutput,
  BeforeToolSelectionInput,
  BeforeToolSelectionOutput,
  NotificationInput,
  SessionStartInput,
  SessionEndInput,
  PreCompressInput,
  BeforeToolOutput,
  AfterToolOutput,
  BeforeAgentOutput,
  AfterAgentOutput,
  NotificationOutput,
  SessionStartOutput,
  PreCompressOutput,
} from '@google/gemini-cli-core';
import type { SessionContext } from './types.js';

/**
 * Map of hook event names to their corresponding input types.
 */
export interface EventInputMap {
  [HookEventName.BeforeTool]: BeforeToolInput;
  [HookEventName.AfterTool]: AfterToolInput;
  [HookEventName.BeforeAgent]: BeforeAgentInput;
  [HookEventName.AfterAgent]: AfterAgentInput;
  [HookEventName.BeforeModel]: BeforeModelInput;
  [HookEventName.AfterModel]: AfterModelInput;
  [HookEventName.BeforeToolSelection]: BeforeToolSelectionInput;
  [HookEventName.Notification]: NotificationInput;
  [HookEventName.SessionStart]: SessionStartInput;
  [HookEventName.SessionEnd]: SessionEndInput;
  [HookEventName.PreCompress]: PreCompressInput;
}

/**
 * Map of hook event names to their corresponding output types.
 */
export interface EventOutputMap {
  [HookEventName.BeforeTool]: BeforeToolOutput;
  [HookEventName.AfterTool]: AfterToolOutput;
  [HookEventName.BeforeAgent]: BeforeAgentOutput;
  [HookEventName.AfterAgent]: AfterAgentOutput;
  [HookEventName.BeforeModel]: BeforeModelOutput;
  [HookEventName.AfterModel]: AfterModelOutput;
  [HookEventName.BeforeToolSelection]: BeforeToolSelectionOutput;
  [HookEventName.Notification]: NotificationOutput;
  [HookEventName.SessionStart]: SessionStartOutput;
  [HookEventName.SessionEnd]: HookOutput;
  [HookEventName.PreCompress]: PreCompressOutput;
}

/**
 * Definition of an SDK hook.
 * Uses a mapped type to create a discriminated union of all possible hooks.
 */
export type Hook = {
  [K in HookEventName]: {
    event: K;
    name: string;
    matcher?: string;
    sequential?: boolean;
    action: (
      input: EventInputMap[K],
      context: SessionContext,
    ) => Promise<EventOutputMap[K] | void | null>;
  };
}[HookEventName];

/**
 * Helper function to create a strongly-typed SDK hook.
 *
 * @param config Hook configuration including event name and optional matcher.
 * @param action The function to execute when the hook event occurs.
 * @returns A Hook object that can be passed to GeminiCliAgent.
 */
export function hook<T extends HookEventName>(
  config: {
    event: T;
    name: string;
    matcher?: string;
    sequential?: boolean;
  },
  action: (
    input: EventInputMap[T],
    context: SessionContext,
  ) => Promise<EventOutputMap[T] | void | null>,
): Hook {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...config,
    action,
  } as unknown as Hook;
}
