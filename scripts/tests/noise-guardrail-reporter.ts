/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Reporter } from 'vitest/reporters';
import type { File } from 'vitest';

/**
 * Custom Vitest reporter designed to enforce a strict "zero noise" policy for passing test files.
 * If a test file passes but emits more than 1 line of stdout/stderr noise, the reporter
 * forcibly fails the suite to prevent regression of issue #23328.
 */
export default class NoiseGuardrailReporter implements Reporter {
  private fileOutputs = new Map<string, string[]>();

  onUserConsoleLog(log: { type: string; content: string; taskId?: string }) {
    if (!log.taskId) return;
    const taskPath = log.taskId.split(' > ')[0];
    if (!this.fileOutputs.has(taskPath)) {
      this.fileOutputs.set(taskPath, []);
    }
    this.fileOutputs.get(taskPath)?.push(log.content);
  }

  onFinished(files?: File[]) {
    if (!files) return;

    // Only enforce strict noise limits in CI environment
    if (!process.env.CI) return;

    let noiseViolations = 0;

    for (const file of files) {
      // Only penalize files that passed (failed files are allowed to be noisy for debugging)
      if (file.result?.state !== 'pass') continue;

      const outputLines = (this.fileOutputs.get(file.id) || [])
        .flatMap((content) => content.split('\n'))
        .filter((line) => line.trim().length > 0);

      // Threshold: <= 1 line of output allowed per passing file
      if (outputLines.length > 1) {
        console.error(`\n❌ NOISE GUARDRAIL VIOLATION: ${file.name}`);
        console.error(
          `  Test file passed but emitted ${outputLines.length} lines of output.`,
        );
        console.error(
          `  Please mock console logs properly or use mockDebugLogger().\n`,
        );
        noiseViolations++;
      }
    }

    if (noiseViolations > 0) {
      console.error(
        `\nTest suite failed due to ${noiseViolations} test files violating the noise guardrail.`,
      );
      throw new Error('Noise guardrail violations detected.');
    }
  }
}
