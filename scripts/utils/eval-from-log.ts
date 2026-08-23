/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Core pipeline for the eval:from-log command.
 *
 * Orchestrates: parse → reconstruct workspace → sanitize → generate skeleton →
 * validate → write output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConversationRecord } from '@google/gemini-cli-core';
import {
  extractWorkspaceFiles,
  extractUserPrompt,
} from './workspace-reconstructor.js';
import { sanitizeContent, sanitizeFileMap } from './log-sanitizer.js';
import {
  generateEvalSkeleton,
  deriveEvalName,
} from './eval-skeleton-generator.js';
import { collectInventory } from './eval-inventory.js';
import { buildToolRegistry } from './tool-registry.js';
import { validateInventory } from './eval-validate.js';

export interface FromLogOptions {
  /**
   * The display name for the generated eval case.
   * If not provided, derived from the first user prompt.
   */
  name?: string;

  /**
   * The `suiteName` field in the generated eval.
   * Defaults to `'regression'`.
   */
  suiteName?: string;

  /**
   * Directory to write the generated file into.
   * Defaults to `<repoRoot>/evals/`.
   */
  outputDir?: string;

  /**
   * If true, return the generated source in `skeleton` but do NOT write a
   * file to disk.
   */
  stdoutMode?: boolean;

  /**
   * If true, run `eval:validate` on the generated file after writing.
   * Defaults to true.
   */
  validate?: boolean;

  /**
   * Repository root for resolving defaults and running validation.
   * Defaults to `process.cwd()`.
   */
  repoRoot?: string;
}

export interface FromLogResult {
  /** Absolute path where the eval file was written. Undefined in stdoutMode. */
  outputPath?: string;

  /** The generated TypeScript source code. */
  skeleton: string;

  /** True if validation ran and passed (or was skipped). */
  validationPassed: boolean;

  /** Non-fatal warnings encountered during generation. */
  warnings: string[];

  /** The sanitized prompt that was used. */
  prompt: string;

  /** The number of workspace files included. */
  fileCount: number;

  /** The tools that were observed and included in assertions. */
  observedTools: string[];
}

/**
 * Converts a human-readable name into a safe filename stem.
 * e.g. "should handle: fix the bug in app.ts" → "fix_the_bug_in_app_ts"
 */
function toFilenameStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/^should\s+(handle:\s*)?/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Picks a unique output file path in the given directory, avoiding collisions
 * with existing files by appending a numeric suffix.
 */
function pickOutputPath(outputDir: string, stem: string): string {
  const base = path.join(outputDir, `${stem}.eval.ts`);
  if (!fs.existsSync(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = path.join(outputDir, `${stem}_${i}.eval.ts`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  // Fall back to a timestamp suffix if all numeric slots are taken
  const ts = Date.now();
  return path.join(outputDir, `${stem}_${ts}.eval.ts`);
}

/**
 * Main pipeline: reads a session JSONL, extracts data, sanitizes, generates
 * an eval skeleton, optionally validates and writes to disk.
 *
 * @param sessionPath - Absolute or relative path to a session `.jsonl` file.
 * @param options - Pipeline configuration.
 * @returns The generation result.
 */
export async function fromLog(
  sessionPath: string,
  options: FromLogOptions = {},
): Promise<FromLogResult> {
  const {
    suiteName = 'regression',
    stdoutMode = false,
    validate = true,
    repoRoot = process.cwd(),
  } = options;

  const warnings: string[] = [];

  // ─── Step 1: Parse the session JSONL ──────────────────────────────────────
  const resolvedSessionPath = path.resolve(sessionPath);
  if (!fs.existsSync(resolvedSessionPath)) {
    throw new Error(`Session file not found: ${resolvedSessionPath}`);
  }

  const conversation = await loadConversationRecord(resolvedSessionPath);
  if (!conversation) {
    throw new Error(
      `Failed to parse session file: ${resolvedSessionPath}\n` +
        'The file may be empty, corrupt, or not a valid session JSONL.',
    );
  }

  // ─── Step 2: Extract workspace files and user prompt ──────────────────────
  const workspace = extractWorkspaceFiles(conversation);
  const rawPrompt = extractUserPrompt(conversation);

  if (!rawPrompt) {
    warnings.push(
      'No user prompt found in session. The generated eval will have an empty prompt — please fill it in manually.',
    );
  }

  if (Object.keys(workspace.files).length === 0) {
    warnings.push(
      'No pre-session workspace files were reconstructed. ' +
        'This happens when the session had no read_file calls before any writes. ' +
        'Consider adding workspace files manually to the generated eval.',
    );
  }

  // ─── Step 3: Sanitize ─────────────────────────────────────────────────────
  const sanitizationOptions = {
    workspaceRoot: workspace.workspaceRoot,
  };

  const sanitizedPrompt = rawPrompt
    ? sanitizeContent(rawPrompt, sanitizationOptions)
    : 'TODO: describe the user request that triggered the bug';

  const sanitizedFiles = sanitizeFileMap(workspace.files, sanitizationOptions);

  // ─── Step 4: Determine eval name ──────────────────────────────────────────
  const evalName = options.name ?? deriveEvalName(sanitizedPrompt);
  const stem = toFilenameStem(evalName);

  // ─── Step 5: Generate skeleton ────────────────────────────────────────────
  const outputDir = options.outputDir ?? path.join(repoRoot, 'evals');
  const outputPath = stdoutMode
    ? path.join(outputDir, `${stem}.eval.ts`)
    : pickOutputPath(outputDir, stem);

  const skeleton = await generateEvalSkeleton(
    {
      name: evalName,
      suiteName,
      prompt: sanitizedPrompt,
      files: sanitizedFiles,
      observedTools: workspace.observedTools,
    },
    outputPath,
  );

  // ─── Step 6: Write to disk (unless stdout mode) ───────────────────────────
  if (!stdoutMode) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, skeleton, 'utf8');
  }

  // ─── Step 7: Validate ─────────────────────────────────────────────────────
  let validationPassed = true;

  if (validate && !stdoutMode) {
    try {
      const inventory = await collectInventory(repoRoot);
      const registry = buildToolRegistry();
      // Validate only the newly generated file by passing its path as a filter
      const result = validateInventory(inventory, registry, {
        filePaths: [outputPath],
      });

      if (result.totalViolations > 0) {
        validationPassed = false;
        for (const v of result.violations) {
          warnings.push(
            `[eval:validate] [${v.ruleId}] ${v.location.line}:${v.location.column} — ${v.message}`,
          );
        }
      }
    } catch (err) {
      warnings.push(
        `eval:validate could not run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    outputPath: stdoutMode ? undefined : outputPath,
    skeleton,
    validationPassed,
    warnings,
    prompt: sanitizedPrompt,
    fileCount: Object.keys(sanitizedFiles).length,
    observedTools: workspace.observedTools,
  };
}
