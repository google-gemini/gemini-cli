/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type TaskType = 'epic' | 'task' | 'bug';

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

export interface TrackerTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  parentId?: string;
  dependencies: string[];
  subagentSessionId?: string;
  metadata?: Record<string, unknown>;
}
