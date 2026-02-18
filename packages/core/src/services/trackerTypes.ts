/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const TaskTypeSchema = z.enum(['epic', 'task', 'bug']);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'open',
  'in_progress',
  'blocked',
  'closed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

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
