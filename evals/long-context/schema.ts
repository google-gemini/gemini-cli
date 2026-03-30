/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const RunnerModeSchema = z.enum(['local_workspace', 'git_clone']);
export const RunnerOutputFormatSchema = z.enum(['text', 'json', 'stream-json']);
export const ApprovalModeSchema = z.enum([
  'default',
  'auto_edit',
  'yolo',
  'plan',
]);

export const RepositorySchema = z
  .object({
    id: z.string().min(1),
    source: RunnerModeSchema,
    root: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    commitSha: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .strict();

export const ManifestTaskEntrySchema = z
  .object({
    id: z.string().min(1),
    file: z.string().min(1),
  })
  .strict();

export const ManifestSchema = z
  .object({
    version: z.string().min(1),
    repositories: z.array(RepositorySchema).min(1),
    tasks: z.array(ManifestTaskEntrySchema).min(1),
  })
  .strict();

export const LocalWorkspaceRunnerSchema = z
  .object({
    mode: z.literal('local_workspace'),
    cwd: z.string().default('.'),
    fakeResponsesPath: z.string().optional(),
    outputFormat: RunnerOutputFormatSchema.default('stream-json'),
    approvalMode: ApprovalModeSchema.default('yolo'),
    cliArgs: z.array(z.string()).default([]),
  })
  .strict();

export const GitCloneRunnerSchema = z
  .object({
    mode: z.literal('git_clone'),
    cwd: z.string().default('.'),
    fakeResponsesPath: z.string().optional(),
    outputFormat: RunnerOutputFormatSchema.default('stream-json'),
    approvalMode: ApprovalModeSchema.default('yolo'),
    cliArgs: z.array(z.string()).default([]),
  })
  .strict();

export const StreamJsonValidationSchema = z
  .object({
    type: z.literal('stream_json'),
    requiredToolNames: z.array(z.string()).default([]),
    finalOutputIncludes: z.array(z.string()).default([]),
    requiredResultStatus: z.enum(['success', 'error']).default('success'),
  })
  .strict();

export const FinalOutputContainsValidationSchema = z
  .object({
    type: z.literal('final_output_contains'),
    text: z.string().min(1),
  })
  .strict();

export const CommandCheckSchema = z
  .object({
    label: z.string().min(1).optional(),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    expectedExitCode: z.number().int().default(0),
    stdoutIncludes: z.array(z.string()).default([]),
    stderrIncludes: z.array(z.string()).default([]),
  })
  .strict();

export const CommandValidationSchema = CommandCheckSchema.extend({
  type: z.literal('command'),
}).strict();

export const ExecutableOracleValidationSchema = z
  .object({
    type: z.literal('executable_oracle'),
    failToPass: z.array(CommandCheckSchema).default([]),
    passToPass: z.array(CommandCheckSchema).default([]),
    build: CommandCheckSchema.optional(),
    augmented: z.array(CommandCheckSchema).default([]),
  })
  .strict();

export const TaskValidationSchema = z.discriminatedUnion('type', [
  StreamJsonValidationSchema,
  FinalOutputContainsValidationSchema,
  CommandValidationSchema,
  ExecutableOracleValidationSchema,
]);

export const TaskSchema = z
  .object({
    id: z.string().min(1),
    repositoryId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    prompt: z.string().min(1),
    timeoutMs: z.number().int().positive().default(60_000),
    runner: z.discriminatedUnion('mode', [
      LocalWorkspaceRunnerSchema,
      GitCloneRunnerSchema,
    ]),
    validation: TaskValidationSchema,
    tags: z.array(z.string()).default([]),
  })
  .strict();

export const ProcessMetricsSchema = z
  .object({
    toolCallCount: z.number().int().nonnegative().default(0),
    toolNames: z.array(z.string()).default([]),
    apiRequestCount: z.number().int().nonnegative().default(0),
    apiErrorCount: z.number().int().nonnegative().default(0),
    chatCompressionCount: z.number().int().nonnegative().default(0),
    compressionTokensSavedTotal: z.number().int().nonnegative().default(0),
    assistantMessageCount: z.number().int().nonnegative().default(0),
    totalTokens: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative().default(0),
  })
  .strict();

export const RunArtifactsSchema = z
  .object({
    runDirectory: z.string().min(1),
    stdoutPath: z.string().min(1),
    stderrPath: z.string().min(1),
    activityLogPath: z.string().min(1),
    reportPath: z.string().min(1),
    runResultPath: z.string().min(1),
  })
  .strict();

export const RunResultSchema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().min(1),
    repositoryId: z.string().min(1),
    status: z.enum(['passed', 'failed']),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    prompt: z.string().min(1),
    validationSummary: z.array(z.string()),
    errorMessage: z.string().optional(),
    artifacts: RunArtifactsSchema,
    processMetrics: ProcessMetricsSchema,
  })
  .strict();

export type Repository = z.infer<typeof RepositorySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestTaskEntry = z.infer<typeof ManifestTaskEntrySchema>;
export type LongContextTask = z.infer<typeof TaskSchema>;
export type TaskValidation = z.infer<typeof TaskValidationSchema>;
export type ProcessMetrics = z.infer<typeof ProcessMetricsSchema>;
export type RunArtifacts = z.infer<typeof RunArtifactsSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;

function toJsonSchema(schema: z.ZodTypeAny, name: string) {
  return zodToJsonSchema(schema, name);
}

export const RepositoryJsonSchema = toJsonSchema(
  RepositorySchema,
  'Repository',
);
export const ManifestTaskEntryJsonSchema = toJsonSchema(
  ManifestTaskEntrySchema,
  'ManifestTaskEntry',
);
export const ManifestJsonSchema = toJsonSchema(ManifestSchema, 'Manifest');
export const TaskJsonSchema = toJsonSchema(TaskSchema, 'LongContextTask');
export const ProcessMetricsJsonSchema = toJsonSchema(
  ProcessMetricsSchema,
  'ProcessMetrics',
);
export const RunResultJsonSchema = toJsonSchema(RunResultSchema, 'RunResult');

export const LongContextJsonSchemas = {
  repository: RepositoryJsonSchema,
  manifestTaskEntry: ManifestTaskEntryJsonSchema,
  manifest: ManifestJsonSchema,
  task: TaskJsonSchema,
  processMetrics: ProcessMetricsJsonSchema,
  runResult: RunResultJsonSchema,
} as const;
