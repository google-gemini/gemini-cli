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
// Phase 1 — core I/O schemas
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

// Inferred TypeScript types — Phase 1
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
export type ShellRunInput = z.infer<typeof ShellRunInputSchema>;

// ---------------------------------------------------------------------------
// Phase 2 — multimodal & advanced tool schemas
// ---------------------------------------------------------------------------

/**
 * Discriminated union for the image source of `screenshot_and_analyze`.
 *
 *   url     → Puppeteer navigates to the URL and takes a viewport screenshot.
 *   desktop → OS utility captures the primary display.
 *   file    → An existing image file is loaded from disk.
 */
export const ScreenshotSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    url: z.string().url().describe('URL to navigate to and capture.'),
  }),
  z.object({
    type: z.literal('desktop'),
  }),
  z.object({
    type: z.literal('file'),
    path: z.string().min(1).describe('Path to an existing image file on disk.'),
  }),
]);

export const ScreenshotAnalyzeInputSchema = z.object({
  source: ScreenshotSourceSchema.describe('Where to obtain the image from.'),
  prompt: z
    .string()
    .min(1)
    .describe(
      'What to analyse in the image (e.g. "Are there any layout problems?").',
    ),
  model: z
    .string()
    .default('gemini-2.0-flash')
    .describe('Gemini model to use for the vision call.'),
});

export const SearchInputSchema = z.object({
  query: z.string().min(1).describe('Natural-language search query.'),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Target number of search results to summarise.'),
});

export const LogMonitorInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      'Shell command to run and monitor (e.g. "npm run dev", "tail -f app.log").',
    ),
  cwd: z
    .string()
    .optional()
    .describe('Working directory; defaults to process.cwd().'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10_000)
    .describe('Maximum monitoring duration in milliseconds (default 10 s).'),
  filter: z
    .string()
    .optional()
    .describe('Regex; only matching log lines are returned to the agent.'),
  stopPattern: z
    .string()
    .optional()
    .describe(
      'Regex that, when matched, terminates monitoring early ' +
        '(e.g. "compiled successfully|Error:").',
    ),
});

// Inferred TypeScript types — Phase 2
export type ScreenshotAnalyzeInput = z.infer<typeof ScreenshotAnalyzeInputSchema>;
export type SearchInput = z.infer<typeof SearchInputSchema>;
export type LogMonitorInput = z.infer<typeof LogMonitorInputSchema>;

// ---------------------------------------------------------------------------
// Tool registry interface
// ---------------------------------------------------------------------------

export interface ToolDefinition<T extends z.ZodTypeAny> {
  /** Unique tool identifier used in LLM function-call payloads. */
  name: string;
  /** Human and model-readable description of what the tool does. */
  description: string;
  /** Zod schema that validates the tool's input parameters. */
  inputSchema: T;
}

// ---------------------------------------------------------------------------
// Combined registry — all tools, Phase 1 + Phase 2
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = {
  // ── Phase 1 ──────────────────────────────────────────────────────────────
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
      'Execute a shell command and return combined stdout/stderr. ' +
      'ALWAYS requires explicit user confirmation before running.',
    inputSchema: ShellRunInputSchema,
  } satisfies ToolDefinition<typeof ShellRunInputSchema>,

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  screenshot_and_analyze: {
    name: 'screenshot_and_analyze',
    description:
      'Capture a screenshot (from a URL, the desktop, or an image file) and send it ' +
      "to Gemini's vision model for analysis. Use when the goal involves UI, CSS, " +
      'layout, rendering, or visual debugging.',
    inputSchema: ScreenshotAnalyzeInputSchema,
  } satisfies ToolDefinition<typeof ScreenshotAnalyzeInputSchema>,

  search: {
    name: 'search',
    description:
      "Query Google Search via Gemini's real-time grounding to look up the latest " +
      'documentation, library versions, bug reports, or any web information.',
    inputSchema: SearchInputSchema,
  } satisfies ToolDefinition<typeof SearchInputSchema>,

  log_monitor: {
    name: 'log_monitor',
    description:
      'Start a process and stream its stdout/stderr to the agent for a bounded ' +
      'duration. Ideal for watching dev servers, test runners, or build pipelines.',
    inputSchema: LogMonitorInputSchema,
  } satisfies ToolDefinition<typeof LogMonitorInputSchema>,
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;
