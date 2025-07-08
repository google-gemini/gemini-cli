/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { CommandContext } from '../ui/commands/types.js';
import { LoadedSettings } from '../config/settings.js';
import { GitService } from '@google/gemini-cli-core';
import { SessionStatsState } from '../ui/contexts/SessionContext.js';

// A utility type to make all properties of an object, and its nested objects, partial.
type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Creates a deep, fully-typed mock of the CommandContext for use in tests.
 * All functions are pre-mocked with `vi.fn()`.
 *
 * @param overrides - A deep partial object to override any default mock values.
 * @returns A complete, mocked CommandContext object.
 */
export const createMockCommandContext = (
  overrides: DeepPartial<CommandContext> = {},
): CommandContext => {
  const defaultMocks: CommandContext = {
    services: {
      config: null,
      settings: { merged: {} } as LoadedSettings,
      git: undefined as GitService | undefined,
      logger: {
        log: vi.fn(),
        logMessage: vi.fn(),
        saveCheckpoint: vi.fn(),
        loadCheckpoint: vi.fn().mockResolvedValue([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, // Cast because Logger is a class.
    },
    ui: {
      addItem: vi.fn(),
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
    },
    session: {
      stats: {
        sessionStartTime: new Date(),
        lastPromptTokenCount: 0,
        metrics: {
          models: {},
          tools: {
            totalCalls: 0,
            totalSuccess: 0,
            totalFail: 0,
            totalDurationMs: 0,
            totalDecisions: { accept: 0, reject: 0, modify: 0 },
            byName: {},
          },
        },
      } as SessionStatsState,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merge = (target: any, source: any): any => {
    const output = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = output[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          output[key] = merge(targetValue, sourceValue);
        } else {
          output[key] = sourceValue;
        }
      }
    }
    return output;
  };

  return merge(defaultMocks, overrides);
};
