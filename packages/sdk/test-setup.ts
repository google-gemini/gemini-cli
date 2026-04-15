/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FORCE_FILE_STORAGE_ENV_VAR,
  coreEvents,
  setDebugLoggerCaptureHook,
} from '@google/gemini-cli-core';
import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest';
import {
  captureConsoleOutput,
  captureDebugLoggerOutput,
  captureProcessWarning,
  finishQuietTest,
  getQuietTestAuditSummary,
  setQuietTestTrackingEnabled,
  type TestStatus,
  startQuietTest,
} from './test-utils/outputControl.js';
import { cleanupTrackedSessions } from './test-utils/sessionHarness.js';

type ConsoleMethod = 'log' | 'warn' | 'error' | 'debug';
type RestorableSpy = { mockRestore(): void };

const verboseTestOutput = process.env['GEMINI_TEST_VERBOSE'] === 'true';
const auditTestOutput = process.env['GEMINI_TEST_OUTPUT_AUDIT'] === 'true';
const originalSdkEnv = {
  apiKey: process.env['GEMINI_API_KEY'],
  forceFileStorage: process.env[FORCE_FILE_STORAGE_ENV_VAR],
  suppressDebugLogger: process.env['GEMINI_SUPPRESS_DEBUG_LOGGER_CONSOLE'],
};

const consoleSpies = new Map<ConsoleMethod, RestorableSpy>();
let emitWarningSpy: RestorableSpy | undefined;
const originalMaxListeners = coreEvents.getMaxListeners();

setQuietTestTrackingEnabled(!verboseTestOutput);

if (!verboseTestOutput) {
  coreEvents.setMaxListeners(Math.max(originalMaxListeners, 100));
  process.env['GEMINI_API_KEY'] = 'test-api-key';
  process.env[FORCE_FILE_STORAGE_ENV_VAR] = 'true';
  process.env['GEMINI_SUPPRESS_DEBUG_LOGGER_CONSOLE'] = 'true';
  setDebugLoggerCaptureHook((level, args) => {
    captureDebugLoggerOutput(level, args);
  });
}

beforeEach((context) => {
  if (verboseTestOutput) {
    return;
  }

  const currentTestName =
    expect.getState().currentTestName ?? context.task.name;
  const currentTestPath =
    expect.getState().testPath ??
    context.task.file?.filepath ??
    'unknown-test-file';

  startQuietTest(currentTestPath, currentTestName);

  for (const level of ['log', 'warn', 'error', 'debug'] as const) {
    consoleSpies.set(
      level,
      vi.spyOn(console, level).mockImplementation((...args) => {
        captureConsoleOutput(level, args);
      }),
    );
  }
  emitWarningSpy = vi
    .spyOn(process, 'emitWarning')
    .mockImplementation((warning: string | Error, ...args: unknown[]) => {
      const warningType = typeof args[0] === 'string' ? args[0] : undefined;
      captureProcessWarning(warning, warningType);
    });
});

afterEach(async (context) => {
  try {
    await cleanupTrackedSessions();

    if (!verboseTestOutput) {
      const result = finishQuietTest(getTestStatus(context.task.result?.state));
      restoreOutputSpies();

      if (getTestStatus(context.task.result?.state) === 'fail') {
        replayCapturedOutput(result.replayEntries);
      }

      if (result.error) {
        throw result.error;
      }
    }
  } finally {
    restoreOutputSpies();
    vi.unstubAllEnvs();
  }
});

afterAll(() => {
  if (!verboseTestOutput) {
    setDebugLoggerCaptureHook(undefined);
    coreEvents.setMaxListeners(originalMaxListeners);
    restoreSdkEnv();
    if (auditTestOutput) {
      process.stderr.write(getQuietTestAuditSummary());
    }
  }
});

function replayCapturedOutput(
  entries: ReadonlyArray<{
    source: 'console' | 'debugLogger' | 'warning';
    level: ConsoleMethod;
    message: string;
  }>,
): void {
  for (const entry of entries) {
    if (entry.source === 'warning') {
      process.stderr.write(`${entry.message}\n`);
      continue;
    }
    console[entry.level](entry.message);
  }
}

function restoreOutputSpies(): void {
  for (const spy of consoleSpies.values()) {
    spy.mockRestore();
  }
  consoleSpies.clear();

  emitWarningSpy?.mockRestore();
  emitWarningSpy = undefined;
}

function restoreSdkEnv(): void {
  if (originalSdkEnv.apiKey === undefined) {
    delete process.env['GEMINI_API_KEY'];
  } else {
    process.env['GEMINI_API_KEY'] = originalSdkEnv.apiKey;
  }

  if (originalSdkEnv.forceFileStorage === undefined) {
    delete process.env[FORCE_FILE_STORAGE_ENV_VAR];
  } else {
    process.env[FORCE_FILE_STORAGE_ENV_VAR] = originalSdkEnv.forceFileStorage;
  }

  if (originalSdkEnv.suppressDebugLogger === undefined) {
    delete process.env['GEMINI_SUPPRESS_DEBUG_LOGGER_CONSOLE'];
  } else {
    process.env['GEMINI_SUPPRESS_DEBUG_LOGGER_CONSOLE'] =
      originalSdkEnv.suppressDebugLogger;
  }
}

function getTestStatus(state: string | undefined): TestStatus {
  return state === 'fail' ? 'fail' : 'pass';
}
