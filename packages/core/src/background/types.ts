/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { Outcome, Language, FunctionResponseScheduling } from '@google/genai';

// Should conform to Part in @google/genai
export const PartSchema = z.object({
  videoMetadata: z
    .object({
      fps: z.number().optional(),
      endOffset: z.string().optional(),
      startOffset: z.string().optional(),
    })
    .optional(),
  thought: z.boolean().optional(),
  inlineData: z
    .object({
      displayName: z.string().optional(),
      data: z.string(),
      mimeType: z.string(),
    })
    .optional(),
  fileData: z
    .object({
      displayName: z.string().optional(),
      fileUri: z.string(),
      mimeType: z.string(),
    })
    .optional(),
  thoughtSignature: z.string().optional(),
  codeExecutionResult: z
    .object({
      outcome: z.nativeEnum(Outcome).optional(),
      output: z.string().optional(),
    })
    .optional(),
  executableCode: z
    .object({
      code: z.string().optional(),
      language: z.nativeEnum(Language).optional(),
    })
    .optional(),
  functionCall: z
    .object({
      id: z.string().optional(),
      args: z.record(z.unknown()).optional(),
      name: z.string(),
    })
    .optional(),
  functionResponse: z
    .object({
      willContinue: z.boolean().optional(),
      scheduling: z.nativeEnum(FunctionResponseScheduling).optional(),
      id: z.string().optional(),
      name: z.string(),
      response: z.record(z.unknown()).optional(),
    })
    .optional(),
  text: z.string().optional(),
});

export const BackgroundAgentMessageSchema = z.object({
  role: z.enum(['user', 'agent']).describe('The role of the sender.'),
  parts: z.array(PartSchema).describe('The parts of the message.'),
});

export const BackgroundAgentTaskStatusSchema = z.object({
  state: z.enum([
    'submitted',
    'working',
    'input-required',
    'completed',
    'failed',
  ]),
  message: BackgroundAgentMessageSchema.describe(
    'Message describing the state of the task.',
  ).optional(),
});

export const BackgroundAgentTaskSchema = z.object({
  id: z.string().describe('The id of the task. Must match `[a-zA-Z0-9.-_]+`'),
  status: BackgroundAgentTaskStatusSchema.describe(
    'The current status of the task.',
  ),
  history: z
    .array(BackgroundAgentMessageSchema)
    .describe('Recent history of messages associated with this task')
    .optional(),
});

export type BackgroundAgentMessage = z.infer<
  typeof BackgroundAgentMessageSchema
>;

export type BackgroundAgentTask = z.infer<typeof BackgroundAgentTaskSchema>;

export const BackgroundAgentTaskResponseSchema = z.object({
  structuredContent: BackgroundAgentTaskSchema,
});

export const BackgroundAgentTasksResponseSchema = z.object({
  structuredContent: z.array(BackgroundAgentTaskSchema),
});
