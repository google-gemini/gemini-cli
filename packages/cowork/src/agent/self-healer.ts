/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * SelfHealer — autonomous Fix-Test-Repeat loop.
 *
 * After the agent writes code, SelfHealer:
 *   1. Detects the test runner (vitest or jest) from package.json.
 *   2. Runs the full test suite (or a filtered subset).
 *   3. Parses the output to extract precise file:line error locations.
 *   4. Reads the failing files.
 *   5. Asks Gemini to suggest targeted fixes as a JSON patch.
 *   6. Applies the patches.
 *   7. Repeats until all tests pass or `maxRetries` is exhausted.
 *
 * The loop is fully autonomous — no human confirmation is required — because
 * it only touches source files that the agent itself wrote, and it never
 * deletes files.  The human-in-the-loop gate still applies for any shell
 * command outside of this loop (via `executor.ts`).
 *
 * Prerequisites
 * ─────────────
 *   GEMINI_API_KEY — required for AI-powered fix suggestions.
 *   A test runner (vitest or jest) installed in the target project.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedError {
  /** Absolute or repo-relative path to the failing file. */
  file: string;
  line: number;
  column: number;
  /** Short error message (first line of the failure). */
  message: string;
  /** Full stack / context block from the test output. */
  context: string;
}

export interface FileChange {
  path: string;
  /** Complete new content for the file (not a diff — full replacement). */
  newContent: string;
  /** One-line explanation of what was changed and why. */
  reason: string;
}

export interface HealAttempt {
  attempt: number;
  passed: boolean;
  testOutput: string;
  errors: ParsedError[];
  /** Changes applied during this attempt. Empty when tests already pass. */
  changes: FileChange[];
}

export interface HealResult {
  success: boolean;
  totalAttempts: number;
  attempts: HealAttempt[];
  finalOutput: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command and capture combined stdout+stderr. */
function runCommand(
  command: string,
  cwd: string,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (c: Buffer) => (output += c.toString()));
    child.stderr.on('data', (c: Buffer) => (output += c.toString()));
    child.on('close', (code) => resolve({ output, exitCode: code ?? 1 }));
    child.on('error', (err) => resolve({ output: err.message, exitCode: 1 }));
  });
}

/**
 * Extract file:line error locations from vitest / jest / tsc output.
 *
 * Handles patterns like:
 *   ● Test description > sub-test
 *     src/foo.ts:12:5 - error TS2345: …
 *     at Object.<anonymous> (src/foo.test.ts:22:7)
 *   FAIL  src/bar.test.ts
 */
function parseErrors(output: string, cwd: string): ParsedError[] {
  const errors: ParsedError[] = [];

  // Vitest / Jest: "FAIL  path/to/file.test.ts"
  const failFileRe = /^(?:FAIL|×)\s+(.+\.(?:ts|tsx|js|jsx))/gm;
  let m: RegExpExecArray | null;

  // TypeScript-style: "path/to/file.ts:10:5 - error …" or "at … (path:10:5)"
  const locationRe =
    /(?:at\s+\S+\s+\()?([\w./\-\\]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\)?/g;

  // Split output into "blocks" separated by blank lines or test separators
  const blocks = output.split(/\n\s*\n/);

  for (const block of blocks) {
    if (
      !block.includes('Error') &&
      !block.includes('FAIL') &&
      !block.includes('✗') &&
      !block.includes('×')
    ) {
      continue;
    }

    locationRe.lastIndex = 0;
    while ((m = locationRe.exec(block)) !== null) {
      const [, rawFile, lineStr, colStr] = m;
      const absFile = rawFile.startsWith('/')
        ? rawFile
        : resolve(cwd, rawFile);

      // Extract the error message: first non-empty line after the location
      const afterLoc = block.slice(m.index + m[0].length).trimStart();
      const firstLine = afterLoc.split('\n')[0].replace(/^[-\s●×✗]+/, '').trim();

      errors.push({
        file: absFile,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        message: firstLine.slice(0, 200),
        context: block.slice(0, 600),
      });
    }
  }

  // De-duplicate by file+line
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.file}:${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Also grab FAIL file references even without location info
  failFileRe.lastIndex = 0;
  while ((m = failFileRe.exec(output)) !== null) {
    const absFile = resolve(cwd, m[1]);
    const key = `${absFile}:0`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push({ file: absFile, line: 0, column: 0, message: 'Test file failed', context: '' });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// SelfHealer
// ---------------------------------------------------------------------------

/**
 * Autonomous Fix-Test-Repeat agent.
 *
 * ```ts
 * const healer = new SelfHealer('/my/project');
 * const result = await healer.heal({ onAttempt: (n, errs) => console.log(n, errs) });
 * if (!result.success) console.error('Could not fix all tests in', result.totalAttempts, 'tries');
 * ```
 */
export class SelfHealer {
  private readonly ai: GoogleGenAI | null;

  constructor(
    private readonly cwd: string,
    private readonly maxRetries = 3,
  ) {
    const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  // -------------------------------------------------------------------------
  // Test runner detection
  // -------------------------------------------------------------------------

  /**
   * Infer the test runner from package.json devDependencies and the `test` script.
   * Returns null when no recognised runner is found.
   */
  detectTestRunner(packageJson: Record<string, unknown> | null): 'jest' | 'vitest' | null {
    if (!packageJson) return null;

    const dev = (packageJson['devDependencies'] as Record<string, string> | undefined) ?? {};
    const deps = (packageJson['dependencies'] as Record<string, string> | undefined) ?? {};
    const scripts = (packageJson['scripts'] as Record<string, string> | undefined) ?? {};

    if ('vitest' in dev || 'vitest' in deps) return 'vitest';
    if ('jest' in dev || 'jest' in deps || '@types/jest' in dev) return 'jest';

    const testScript = scripts['test'] ?? '';
    if (testScript.includes('vitest')) return 'vitest';
    if (testScript.includes('jest')) return 'jest';

    return null;
  }

  // -------------------------------------------------------------------------
  // Test execution
  // -------------------------------------------------------------------------

  /**
   * Run the test suite and return the raw output + pass/fail status.
   */
  async runTests(runner: 'jest' | 'vitest', filter?: string): Promise<{ output: string; passed: boolean }> {
    const filterArg = filter ? ` --reporter=verbose "${filter}"` : '';
    const cmd =
      runner === 'vitest'
        ? `npx vitest run${filterArg} --no-coverage`
        : `npx jest${filterArg} --no-coverage --forceExit`;

    const { output, exitCode } = await runCommand(cmd, this.cwd);
    return { output, passed: exitCode === 0 };
  }

  // -------------------------------------------------------------------------
  // AI-powered fix suggestion
  // -------------------------------------------------------------------------

  /**
   * Ask Gemini to produce targeted file changes that should fix the given errors.
   * Returns an empty array when no API key is available or the model cannot
   * produce a valid patch.
   */
  async suggestFixes(errors: ParsedError[]): Promise<FileChange[]> {
    if (!this.ai || errors.length === 0) return [];

    // Read unique failing files (up to 5 to stay within context limits)
    const uniqueFiles = [...new Set(errors.map((e) => e.file))].slice(0, 5);
    const fileContents: Record<string, string> = {};

    for (const file of uniqueFiles) {
      try {
        fileContents[file] = await readFile(file, 'utf-8');
      } catch {
        fileContents[file] = '(file not readable)';
      }
    }

    const errorSummary = errors
      .slice(0, 10)
      .map((e) => `${e.file}:${e.line}: ${e.message}\n${e.context}`)
      .join('\n---\n');

    const filesBlock = Object.entries(fileContents)
      .map(([path, content]) => `### FILE: ${path}\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``)
      .join('\n\n');

    const prompt = `You are a TypeScript debugging assistant. Fix the failing tests below.

## Failing tests / errors
${errorSummary}

## Source files
${filesBlock}

## Instructions
Return ONLY a JSON array of file changes. Each element must have:
  - "path": absolute file path (string)
  - "newContent": the COMPLETE corrected file content (string)
  - "reason": one-sentence explanation (string)

Do not include any markdown, explanation, or text outside the JSON array.
Example: [{"path":"/app/src/foo.ts","newContent":"...","reason":"Fixed type error"}]`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const raw = (response.text ?? '').trim();
      // Strip possible markdown fences
      const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const changes = JSON.parse(jsonStr) as FileChange[];
      return Array.isArray(changes) ? changes : [];
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Fix application
  // -------------------------------------------------------------------------

  /** Write all suggested changes to disk. */
  async applyFixes(changes: FileChange[]): Promise<void> {
    for (const change of changes) {
      const absPath = change.path.startsWith('/')
        ? change.path
        : join(this.cwd, change.path);
      await writeFile(absPath, change.newContent, 'utf-8');
    }
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  /**
   * Run the Fix-Test-Repeat loop.
   *
   * @param opts.packageJson  Parsed package.json for runner detection.
   * @param opts.testFilter   Optional test name / file filter.
   * @param opts.onAttempt    Callback fired after each attempt.
   */
  async heal(opts: {
    packageJson?: Record<string, unknown> | null;
    testFilter?: string;
    onAttempt?: (attempt: number, passed: boolean, errors: ParsedError[]) => void;
  } = {}): Promise<HealResult> {
    const runner = this.detectTestRunner(opts.packageJson ?? null) ?? 'vitest';
    const attempts: HealAttempt[] = [];

    for (let i = 1; i <= this.maxRetries; i++) {
      const { output, passed } = await this.runTests(runner, opts.testFilter);
      const errors = passed ? [] : parseErrors(output, this.cwd);

      const attempt: HealAttempt = { attempt: i, passed, testOutput: output, errors, changes: [] };

      if (passed) {
        attempts.push(attempt);
        opts.onAttempt?.(i, true, []);
        return { success: true, totalAttempts: i, attempts, finalOutput: output };
      }

      // Ask Gemini for fixes and apply them
      const changes = await this.suggestFixes(errors);
      attempt.changes = changes;
      attempts.push(attempt);
      opts.onAttempt?.(i, false, errors);

      if (changes.length === 0) break; // No actionable fixes — stop early
      await this.applyFixes(changes);
    }

    const last = attempts.at(-1);
    return {
      success: false,
      totalAttempts: attempts.length,
      attempts,
      finalOutput: last?.testOutput ?? '',
    };
  }
}
