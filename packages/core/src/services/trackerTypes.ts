/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export enum TaskType {
  EPIC = 'epic',
  TASK = 'task',
  BUG = 'bug',
}
export const TaskTypeSchema = z.nativeEnum(TaskType);

export enum TaskStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  CLOSED = 'closed',
}
export const TaskStatusSchema = z.nativeEnum(TaskStatus);

export const TrackerTaskSchema = z.object({
  id: z.string().length(6),
  title: z.string(),
  description: z.string(),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  parentId: z.string().optional(),
  dependencies: z.array(z.string()),
  subagentSessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type TrackerTask = z.infer<typeof TrackerTaskSchema>;
