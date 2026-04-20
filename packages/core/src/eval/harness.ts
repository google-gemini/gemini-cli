/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Evaluation harness that orchestrates running scenarios,
 * setting up isolated environments, and collecting results.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  EvalScenario,
  EvalResult,
  ExpectedOutcome,
  FileChange,
} from './types.js';

/** Configuration options for the evaluation harness. */
export interface HarnessOptions {
  /** Maximum number of scenarios to run concurrently. */
  concurrency: number;
  /** Default timeout in milliseconds for each scenario. */
  timeout: number;
  /** Optional filter to select specific scenarios by id or tag. */
  filter?: (scenario: EvalScenario) => boolean;
}

const DEFAULT_OPTIONS: HarnessOptions = {
  concurrency: 4,
  timeout: 30_000,
};

/**
 * Evaluation harness responsible for executing scenarios in isolated
 * temporary directories and validating outcomes.
 */
export class EvalHarness {
  private readonly options: HarnessOptions;

  constructor(options: Partial<HarnessOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Runs all provided scenarios, respecting concurrency limits and filters.
   *
   * @param scenarios The full list of scenarios to evaluate.
   * @returns An array of results, one per executed scenario.
   */
  async runAll(scenarios: EvalScenario[]): Promise<EvalResult[]> {
    const filtered = this.options.filter
      ? scenarios.filter(this.options.filter)
      : scenarios;

    const results: EvalResult[] = [];
    const chunks = chunkArray(filtered, this.options.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((scenario) => this.runScenario(scenario)),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Runs a single evaluation scenario in an isolated temp directory.
   *
   * @param scenario The scenario to execute.
   * @returns The evaluation result including score and any errors.
   */
  async runScenario(scenario: EvalScenario): Promise<EvalResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const fileChanges: Record<string, string> = {};
    let output = '';

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `eval-${scenario.id}-`),
    );

    try {
      // Set up the scenario files in the temp directory.
      await this.setupFiles(tmpDir, scenario.setupFiles);

      // Simulate running the prompt against the agent.
      // In a real integration this would invoke the Gemini CLI core turn loop.
      output = await this.executePrompt(scenario, tmpDir);

      // Collect resulting file contents.
      await this.collectFileChanges(tmpDir, scenario, fileChanges);

      // Validate outcomes.
      const outcomeErrors = validateOutcome(
        scenario.expectedOutcome,
        output,
        fileChanges,
      );
      errors.push(...outcomeErrors);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Scenario execution error: ${message}`);
    } finally {
      // Clean up temp directory.
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    const duration = Date.now() - startTime;
    const score = computeRawScore(
      scenario.expectedOutcome,
      output,
      fileChanges,
      errors,
      duration,
      scenario.timeoutMs ?? this.options.timeout,
    );
    const passed = errors.length === 0 && score >= 50;

    return {
      scenarioId: scenario.id,
      passed,
      score,
      duration,
      output,
      fileChanges,
      errors,
    };
  }

  /**
   * Writes the setup files for a scenario into the given directory.
   */
  private async setupFiles(
    dir: string,
    files: Record<string, string>,
  ): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * Executes the scenario prompt. This is a stub that returns an empty string
   * by default. Override or extend this method to wire up the actual agent
   * execution pipeline.
   */
  protected async executePrompt(
    _scenario: EvalScenario,
    _workDir: string,
  ): Promise<string> {
    // Stub: real implementation would invoke the core turn loop.
    return '';
  }

  /**
   * Reads files from the temp directory that are referenced in expected outcomes.
   */
  private async collectFileChanges(
    dir: string,
    scenario: EvalScenario,
    fileChanges: Record<string, string>,
  ): Promise<void> {
    const expectedFiles = scenario.expectedOutcome.fileChanges ?? [];
    for (const fc of expectedFiles) {
      const fullPath = path.join(dir, fc.path);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        fileChanges[fc.path] = content;
      } catch {
        // File does not exist — that's valid information for validation.
      }
    }

    // Also collect any files from setupFiles to detect modifications.
    for (const filePath of Object.keys(scenario.setupFiles)) {
      if (fileChanges[filePath] !== undefined) continue;
      const fullPath = path.join(dir, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        fileChanges[filePath] = content;
      } catch {
        // File was deleted — record as absent.
      }
    }
  }
}

/**
 * Validates the actual outcome against the expected outcome specification.
 *
 * @returns An array of error messages. Empty means all checks passed.
 */
export function validateOutcome(
  expected: ExpectedOutcome,
  output: string,
  fileChanges: Record<string, string>,
): string[] {
  const errors: string[] = [];

  // Validate output contains expected strings.
  if (expected.outputContains) {
    for (const needle of expected.outputContains) {
      if (!output.includes(needle)) {
        errors.push(`Output missing expected string: "${needle}"`);
      }
    }
  }

  // Validate output does NOT contain forbidden strings.
  if (expected.outputNotContains) {
    for (const needle of expected.outputNotContains) {
      if (output.includes(needle)) {
        errors.push(`Output contains forbidden string: "${needle}"`);
      }
    }
  }

  // Validate file changes.
  if (expected.fileChanges) {
    for (const fc of expected.fileChanges) {
      validateFileChange(fc, fileChanges, errors);
    }
  }

  return errors;
}

/**
 * Validates a single expected file change.
 */
function validateFileChange(
  expected: FileChange,
  fileChanges: Record<string, string>,
  errors: string[],
): void {
  const content = fileChanges[expected.path];
  const exists = content !== undefined;

  if (expected.shouldExist && !exists) {
    errors.push(`Expected file to exist: ${expected.path}`);
    return;
  }

  if (!expected.shouldExist && exists) {
    errors.push(`Expected file to NOT exist: ${expected.path}`);
    return;
  }

  if (!exists) return;

  if (expected.contentContains) {
    for (const needle of expected.contentContains) {
      if (!content.includes(needle)) {
        errors.push(
          `File "${expected.path}" missing expected content: "${needle}"`,
        );
      }
    }
  }

  if (expected.contentNotContains) {
    for (const needle of expected.contentNotContains) {
      if (content.includes(needle)) {
        errors.push(
          `File "${expected.path}" contains forbidden content: "${needle}"`,
        );
      }
    }
  }
}

/**
 * Computes a raw score (0-100) for a scenario result based on weighted criteria.
 *
 * Weights:
 * - File changes correctness: 40%
 * - Output correctness: 30%
 * - No errors: 20%
 * - Time bonus: 10%
 */
export function computeRawScore(
  expected: ExpectedOutcome,
  output: string,
  fileChanges: Record<string, string>,
  errors: string[],
  duration: number,
  timeout: number,
): number {
  let fileScore = 100;
  let outputScore = 100;
  const errorScore = errors.length === 0 ? 100 : 0;
  const timeScore =
    duration < timeout ? Math.round((1 - duration / timeout) * 100) : 0;

  // File changes scoring.
  if (expected.fileChanges && expected.fileChanges.length > 0) {
    const fileErrors: string[] = [];
    for (const fc of expected.fileChanges) {
      validateFileChange(fc, fileChanges, fileErrors);
    }
    const passed = expected.fileChanges.length - fileErrors.length;
    fileScore = Math.round((passed / expected.fileChanges.length) * 100);
  }

  // Output scoring.
  const totalOutputChecks =
    (expected.outputContains?.length ?? 0) +
    (expected.outputNotContains?.length ?? 0);
  if (totalOutputChecks > 0) {
    let outputPassed = 0;
    for (const needle of expected.outputContains ?? []) {
      if (output.includes(needle)) outputPassed++;
    }
    for (const needle of expected.outputNotContains ?? []) {
      if (!output.includes(needle)) outputPassed++;
    }
    outputScore = Math.round((outputPassed / totalOutputChecks) * 100);
  }

  return Math.round(
    fileScore * 0.4 + outputScore * 0.3 + errorScore * 0.2 + timeScore * 0.1,
  );
}

/**
 * Splits an array into chunks of the given size.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
