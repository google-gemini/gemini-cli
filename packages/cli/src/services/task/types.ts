/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type TaskPhase = 'plan' | 'execute' | 'verify' | 'summarize';

export type TaskStatus = 'idle' | 'submitted' | 'cancelled';

export interface TaskRun {
  id: string;
  traceId: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  phases: readonly TaskPhase[];
}
