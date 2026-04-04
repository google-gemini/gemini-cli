/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from 'node:util';

export type OutputSource = 'console' | 'debugLogger' | 'warning';
export type OutputLevel = 'log' | 'warn' | 'error' | 'debug';
export type TestStatus = 'pass' | 'fail';

export interface CapturedOutput {
  source: OutputSource;
  level: OutputLevel;
  message: string;
}

export interface OutputMatcher {
  pattern: RegExp | string;
  source?: OutputSource;
  level?: OutputLevel;
}

interface RegisteredMatcher {
  matcher: OutputMatcher;
  required: boolean;
}

interface ActiveTest {
  filePath: string;
  testName: string;
  entries: CapturedOutput[];
  matchers: RegisteredMatcher[];
}

interface AuditEntry {
  count: number;
  sampleMessages: string[];
}

export interface TestCompletionResult {
  replayEntries: CapturedOutput[];
  error?: Error;
}

const AUDITED_SOURCE = 'debugLogger';

export class TestOutputController {
  private activeTest: ActiveTest | undefined;
  private readonly auditEntries = new Map<string, AuditEntry>();
  private trackingEnabled = true;

  setTrackingEnabled(enabled: boolean): void {
    this.trackingEnabled = enabled;
    if (!enabled) {
      this.activeTest = undefined;
    }
  }

  startTest(filePath: string, testName: string): void {
    if (!this.trackingEnabled) {
      return;
    }

    if (this.activeTest) {
      throw new Error(
        `Output controller already tracking "${this.activeTest.testName}".`,
      );
    }

    this.activeTest = {
      filePath,
      testName,
      entries: [],
      matchers: [],
    };
  }

  captureOutput(
    source: OutputSource,
    level: OutputLevel,
    args: unknown[],
  ): void {
    if (!this.trackingEnabled || !this.activeTest) {
      return;
    }

    this.activeTest.entries.push({
      source,
      level,
      message: format(...args),
    });
  }

  captureWarning(warning: string | Error, type?: string): void {
    const pieces =
      warning instanceof Error
        ? [warning.name, warning.message].filter(Boolean)
        : [warning, type].filter(Boolean);
    this.captureOutput('warning', 'warn', [pieces.join(': ')]);
  }

  allowOutput(...matchers: OutputMatcher[]): void {
    this.registerMatchers(false, matchers);
  }

  expectOutput(...matchers: OutputMatcher[]): void {
    this.registerMatchers(true, matchers);
  }

  finishTest(status: TestStatus): TestCompletionResult {
    if (!this.trackingEnabled) {
      return { replayEntries: [] };
    }

    if (!this.activeTest) {
      throw new Error('Output controller is not tracking a test.');
    }

    const completedTest = this.activeTest;
    this.activeTest = undefined;

    const matchedEntries = new Set<number>();
    const missingRequiredMatchers: OutputMatcher[] = [];

    for (const registeredMatcher of completedTest.matchers) {
      const matchedIndex = completedTest.entries.findIndex((entry, index) => {
        if (matchedEntries.has(index)) {
          return false;
        }
        return this.matches(entry, registeredMatcher.matcher);
      });

      if (matchedIndex === -1) {
        if (registeredMatcher.required) {
          missingRequiredMatchers.push(registeredMatcher.matcher);
        }
        continue;
      }

      matchedEntries.add(matchedIndex);
    }

    const unexpectedEntries = completedTest.entries.filter(
      (_entry, index) => !matchedEntries.has(index),
    );
    const strictUnexpectedEntries = unexpectedEntries.filter(
      (entry) => entry.source !== AUDITED_SOURCE,
    );
    const auditedEntries = unexpectedEntries.filter(
      (entry) => entry.source === AUDITED_SOURCE,
    );

    if (auditedEntries.length > 0) {
      this.recordAudit(completedTest.filePath, auditedEntries);
    }

    if (status === 'fail') {
      return { replayEntries: completedTest.entries };
    }

    if (
      strictUnexpectedEntries.length === 0 &&
      missingRequiredMatchers.length === 0
    ) {
      return { replayEntries: [] };
    }

    const details: string[] = [];
    if (strictUnexpectedEntries.length > 0) {
      details.push('Unexpected test output:');
      details.push(
        ...strictUnexpectedEntries.map((entry) => this.formatEntry(entry)),
      );
    }
    if (missingRequiredMatchers.length > 0) {
      details.push('Missing expected output assertions:');
      details.push(
        ...missingRequiredMatchers.map((matcher) =>
          this.formatMatcher(matcher),
        ),
      );
    }

    return {
      replayEntries: [],
      error: new Error(
        [
          `Passing test emitted unexpected output: ${completedTest.testName}`,
          ...details,
          'Use expectTestOutput(...) for intentional logs or remove the source of noise.',
        ].join('\n'),
      ),
    };
  }

  formatAuditSummary(): string {
    if (this.auditEntries.size === 0) {
      return '[quiet-test-audit] No audited debugLogger output recorded.\n';
    }

    const lines = [
      '[quiet-test-audit] Files still emitting debugLogger output:',
    ];
    for (const [filePath, entry] of [...this.auditEntries.entries()].sort()) {
      lines.push(`- ${filePath}: ${entry.count} entries`);
      for (const sample of entry.sampleMessages) {
        lines.push(`  sample: ${sample}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  private registerMatchers(required: boolean, matchers: OutputMatcher[]): void {
    if (!this.trackingEnabled) {
      return;
    }

    if (!this.activeTest) {
      throw new Error('Output controller is not tracking a test.');
    }

    for (const matcher of matchers) {
      this.activeTest.matchers.push({ matcher, required });
    }
  }

  private matches(entry: CapturedOutput, matcher: OutputMatcher): boolean {
    if (matcher.source && matcher.source !== entry.source) {
      return false;
    }
    if (matcher.level && matcher.level !== entry.level) {
      return false;
    }
    if (typeof matcher.pattern === 'string') {
      return entry.message.includes(matcher.pattern);
    }
    return matcher.pattern.test(entry.message);
  }

  private recordAudit(filePath: string, entries: CapturedOutput[]): void {
    const existing = this.auditEntries.get(filePath) ?? {
      count: 0,
      sampleMessages: [],
    };
    existing.count += entries.length;
    for (const entry of entries) {
      if (existing.sampleMessages.length >= 2) {
        break;
      }
      if (!existing.sampleMessages.includes(entry.message)) {
        existing.sampleMessages.push(entry.message);
      }
    }
    this.auditEntries.set(filePath, existing);
  }

  private formatEntry(entry: CapturedOutput): string {
    return `- [${entry.source}.${entry.level}] ${entry.message}`;
  }

  private formatMatcher(matcher: OutputMatcher): string {
    const prefix = [matcher.source, matcher.level].filter(Boolean).join('.');
    const pattern =
      typeof matcher.pattern === 'string'
        ? matcher.pattern
        : matcher.pattern.toString();
    return `- [${prefix || 'any'}] ${pattern}`;
  }
}

const controller = new TestOutputController();

export function captureConsoleOutput(
  level: OutputLevel,
  args: unknown[],
): void {
  controller.captureOutput('console', level, args);
}

export function captureDebugLoggerOutput(
  level: OutputLevel,
  args: unknown[],
): void {
  controller.captureOutput('debugLogger', level, args);
}

export function captureProcessWarning(
  warning: string | Error,
  type?: string,
): void {
  controller.captureWarning(warning, type);
}

export function startQuietTest(filePath: string, testName: string): void {
  controller.startTest(filePath, testName);
}

export function finishQuietTest(status: TestStatus): TestCompletionResult {
  return controller.finishTest(status);
}

export function allowTestOutput(...matchers: OutputMatcher[]): void {
  controller.allowOutput(...matchers);
}

export function expectTestOutput(...matchers: OutputMatcher[]): void {
  controller.expectOutput(...matchers);
}

export function getQuietTestAuditSummary(): string {
  return controller.formatAuditSummary();
}

export function setQuietTestTrackingEnabled(enabled: boolean): void {
  controller.setTrackingEnabled(enabled);
}
