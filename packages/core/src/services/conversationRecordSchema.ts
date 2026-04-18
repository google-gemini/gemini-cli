/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { AgentTerminateMode } from '../agents/types.js';
import { Language, Outcome } from '@google/genai';
import type { TokensSummary, ToolCallRecord } from './chatRecordingService.js';
import type { ToolResultDisplay } from '../tools/tools.js';

const nonEmptyStringSchema = z.string().min(1);

const todoStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'blocked',
]);

const subagentActivityStatusSchema = z.enum([
  'running',
  'completed',
  'error',
  'cancelled',
]);

const subagentProgressStateSchema = z.enum([
  'running',
  'completed',
  'error',
  'cancelled',
]);

const diffStatSchema = z
  .object({
    model_added_lines: z.number(),
    model_removed_lines: z.number(),
    model_added_chars: z.number(),
    model_removed_chars: z.number(),
    user_added_lines: z.number(),
    user_removed_lines: z.number(),
    user_added_chars: z.number(),
    user_removed_chars: z.number(),
  })
  .strict();

const fileDiffSchema = z
  .object({
    fileDiff: nonEmptyStringSchema,
    fileName: nonEmptyStringSchema,
    filePath: nonEmptyStringSchema,
    originalContent: z.string().nullable(),
    newContent: z.string(),
    diffStat: diffStatSchema.optional(),
    isNewFile: z.boolean().optional(),
  })
  .strict();

const ansiTokenSchema = z
  .object({
    text: z.string(),
    bold: z.boolean(),
    italic: z.boolean(),
    underline: z.boolean(),
    dim: z.boolean(),
    inverse: z.boolean(),
    fg: z.string(),
    bg: z.string(),
  })
  .strict();

const ansiOutputSchema = z.array(z.array(ansiTokenSchema));

const todoSchema = z
  .object({
    description: z.string(),
    status: todoStatusSchema,
  })
  .strict();

const todoListSchema = z
  .object({
    todos: z.array(todoSchema),
  })
  .strict();

const subagentActivityItemSchema = z
  .object({
    id: nonEmptyStringSchema,
    type: z.enum(['thought', 'tool_call']),
    content: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    args: z.string().optional(),
    status: subagentActivityStatusSchema,
  })
  .strict();

const subagentProgressSchema = z
  .object({
    isSubagentProgress: z.literal(true),
    agentName: nonEmptyStringSchema,
    recentActivity: z.array(subagentActivityItemSchema),
    state: subagentProgressStateSchema.optional(),
    result: z.string().optional(),
    terminateReason: z.nativeEnum(AgentTerminateMode).optional(),
  })
  .strict();

const grepResultSchema = z
  .object({
    summary: z.string(),
    matches: z.array(z.unknown()),
    payload: z.string().optional(),
  })
  .strict();

const listDirectoryResultSchema = z
  .object({
    summary: z.string(),
    files: z.array(z.string()),
    payload: z.string().optional(),
  })
  .strict();

const readManyFilesResultSchema = z
  .object({
    summary: z.string(),
    files: z.array(z.string()),
    skipped: z
      .array(
        z.object({
          path: z.string(),
          reason: z.string(),
        })
      )
      .optional(),
    include: z.array(z.string()).optional(),
    excludes: z.array(z.string()).optional(),
    targetDir: z.string().optional(),
    payload: z.string().optional(),
  })
  .strict();

export const toolResultDisplaySchema: z.ZodType<ToolResultDisplay> = z.union([
  z.string(),
  fileDiffSchema,
  ansiOutputSchema,
  todoListSchema,
  subagentProgressSchema,
  grepResultSchema,
  listDirectoryResultSchema,
  readManyFilesResultSchema,
]);

const inlineDataSchema = z
  .object({
    data: z.string(),
    mimeType: z.string().optional(),
  })
  .strict();

const fileDataSchema = z
  .object({
    fileUri: z.string(),
    mimeType: z.string().optional(),
  })
  .strict();

const functionCallSchema = z
  .object({
    name: nonEmptyStringSchema,
    id: z.string().optional(),
    args: z.record(z.unknown()).optional(),
  })
  .strict();

const executableCodeSchema = z
  .object({
    code: z.string(),
    language: z.nativeEnum(Language).optional(),
  })
  .strict();

const codeExecutionResultSchema = z
  .object({
    outcome: z.nativeEnum(Outcome).optional(),
    output: z.string().optional(),
  })
  .strict()
  .refine(
    (result) => result.outcome !== undefined || result.output !== undefined,
    {
      message:
        'codeExecutionResult must include at least one of outcome or output.',
    }
  );

const thoughtSummaryWithTimestampSchema = z
  .object({
    subject: z.string(),
    description: z.string(),
    timestamp: nonEmptyStringSchema,
  })
  .strict();

let partObjectSchema: z.ZodTypeAny;

const partItemSchema = z.lazy(() =>
  z.union([z.string(), partObjectSchema])
);

partObjectSchema = z.lazy(() =>
  z
    .object({
      text: z.string().optional(),
      thought: z.boolean().optional(),
      thoughtSignature: z.string().optional(),
      inlineData: inlineDataSchema.optional(),
      fileData: fileDataSchema.optional(),
      functionCall: functionCallSchema.optional(),
      functionResponse: z
        .object({
          name: nonEmptyStringSchema,
          id: z.string().optional(),
          response: z.unknown(),
          parts: z.array(partItemSchema).optional(),
        })
        .strict()
        .optional(),
      executableCode: executableCodeSchema.optional(),
      codeExecutionResult: codeExecutionResultSchema.optional(),
      videoMetadata: z.unknown().optional(),
    })
    .strict()
    .refine(
      (part) =>
        part.text !== undefined ||
        part.thought === true ||
        part.thoughtSignature !== undefined ||
        part.inlineData !== undefined ||
        part.fileData !== undefined ||
        part.functionCall !== undefined ||
        part.functionResponse !== undefined ||
        part.executableCode !== undefined ||
        part.codeExecutionResult !== undefined ||
        part.videoMetadata !== undefined,
      {
        message:
          'Part must include at least one meaningful content field.',
      }
    )
);

export const partListUnionSchema: z.ZodTypeAny = z.union([
  z.string(),
  partObjectSchema,
  z.array(partItemSchema),
]);

const toolCallStatusSchema = z.nativeEnum(CoreToolCallStatus);

export const tokensSummarySchema: z.ZodType<TokensSummary> = z
  .object({
    input: z.number(),
    output: z.number(),
    cached: z.number(),
    thoughts: z.number().optional(),
    tool: z.number().optional(),
    total: z.number(),
  })
  .strict();

export const toolCallRecordSchema: z.ZodType<ToolCallRecord> = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    args: z.record(z.unknown()),
    result: partListUnionSchema.nullable().optional(),
    status: toolCallStatusSchema,
    timestamp: nonEmptyStringSchema,
    displayName: z.string().optional(),
    description: z.string().optional(),
    resultDisplay: toolResultDisplaySchema.optional(),
    renderOutputAsMarkdown: z.boolean().optional(),
  })
  .strict();

const baseMessageRecordSchema = z
  .object({
    id: nonEmptyStringSchema,
    timestamp: nonEmptyStringSchema,
    content: partListUnionSchema,
    displayContent: partListUnionSchema.optional(),
  })
  .strict();

const userLikeMessageRecordSchema = baseMessageRecordSchema
  .extend({
    type: z.enum(['user', 'info', 'error', 'warning']),
  })
  .strict();

const geminiMessageRecordSchema = baseMessageRecordSchema
  .extend({
    type: z.literal('gemini'),
    toolCalls: z.array(toolCallRecordSchema).optional(),
    thoughts: z.array(thoughtSummaryWithTimestampSchema).optional(),
    tokens: tokensSummarySchema.nullable().optional(),
    model: z.string().optional(),
  })
  .strict();

export const messageRecordSchema = z.discriminatedUnion('type', [
  userLikeMessageRecordSchema,
  geminiMessageRecordSchema,
]);

export const conversationRecordSchema = z
  .object({
    sessionId: nonEmptyStringSchema,
    projectHash: nonEmptyStringSchema,
    startTime: nonEmptyStringSchema,
    lastUpdated: nonEmptyStringSchema,
    messages: z.array(messageRecordSchema),
    summary: z.string().optional(),
    directories: z.array(z.string()).optional(),
    kind: z.enum(['main', 'subagent']).optional(),
  })
  .strict();

export type ConversationRecordSchemaType = z.infer<
  typeof conversationRecordSchema
>;
export type MessageRecordSchemaType = z.infer<typeof messageRecordSchema>;
export type ToolCallRecordSchemaType = z.infer<typeof toolCallRecordSchema>;
export type TokensSummarySchemaType = z.infer<typeof tokensSummarySchema>;