/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tool schemas for Gemini Cowork.
 * Each tool is defined with a Zod schema so inputs are validated at runtime
 * and can be forwarded to the Gemini API as JSON Schema via zod-to-json-schema.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const ReadFileInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Absolute or project-relative path of the file to read.'),
});

export const WriteFileInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Absolute or project-relative path to write to.'),
  content: z.string().describe('Full UTF-8 content to write to the file.'),
});

export const ShellRunInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe('Shell command to execute (requires user confirmation).'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory; defaults to process.cwd().'),
});

// Inferred TypeScript types
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
export type ShellRunInput = z.infer<typeof ShellRunInputSchema>;

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolDefinition<T extends z.ZodTypeAny> {
  /** Unique tool identifier used in LLM function-call payloads. */
  name: string;
  /** Human and model-readable description of what the tool does. */
  description: string;
  /** Zod schema that validates the tool's input parameters. */
  inputSchema: T;
}

export const TOOL_DEFINITIONS = {
  read_file: {
    name: 'read_file',
    description:
      'Read the UTF-8 contents of a file at the given path and return them as a string.',
    inputSchema: ReadFileInputSchema,
  } satisfies ToolDefinition<typeof ReadFileInputSchema>,

  write_file: {
    name: 'write_file',
    description:
      'Write content to a file at the given path, creating parent directories as needed.',
    inputSchema: WriteFileInputSchema,
  } satisfies ToolDefinition<typeof WriteFileInputSchema>,

  shell_run: {
    name: 'shell_run',
    description:
      'Execute a shell command and return combined stdout/stderr output. ' +
      'ALWAYS requires explicit user confirmation before running.',
    inputSchema: ShellRunInputSchema,
  } satisfies ToolDefinition<typeof ShellRunInputSchema>,
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;
