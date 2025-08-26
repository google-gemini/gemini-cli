/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentSettings } from './types.js';
import type { TaskState } from '@a2a-js/sdk';

export interface PersistedStateMetadata {
  _agentSettings: AgentSettings;
  _taskState: TaskState;
}

export type PersistedTaskMetadata = { [k: string]: unknown };

export const METADATA_KEY = '__persistedState';

export function getPersistedState(
  metadata: PersistedTaskMetadata,
): PersistedStateMetadata | undefined {
  return metadata?.[METADATA_KEY] as PersistedStateMetadata | undefined;
}

export function setPersistedState(
  metadata: PersistedTaskMetadata,
  state: PersistedStateMetadata,
): PersistedTaskMetadata {
  return {
    ...metadata,
    [METADATA_KEY]: state,
  };
}
