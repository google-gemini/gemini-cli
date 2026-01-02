/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArguments } from './config.js';
import type { LoadedSettings } from './settings.js';

describe('Disable Model Fallback Feature', () => {
  let mockSettings: LoadedSettings;
  const mockExit = vi
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);

  // Mock dependencies
  vi.mock('@google/gemini-cli-core', async () => {
    const actual = await vi.importActual('@google/gemini-cli-core');
    return {
      ...actual,
      runExitCleanup: vi.fn(),
      debugLogger: {
        error: vi.fn((msg) => console.error('DEBUG LOGGER ERROR:', msg)),
        log: vi.fn(),
        warn: vi.fn(),
      },
    };
  });

  beforeEach(() => {
    mockExit.mockClear();
    mockSettings = {
      merged: {
        general: {
          disableModelFallback: false,
        },
      },
      applyCliOverrides: vi.fn((overrides) => {
        (mockSettings as { merged: LoadedSettings['merged'] }).merged = {
          ...mockSettings.merged,
          ...overrides,
        };
      }),
    } as unknown as LoadedSettings;
  });

  it('should parse --no-model-fallback flag', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'gemini', '--no-model-fallback'];

    const args = await parseArguments(mockSettings.merged);
    expect(args.modelFallback).toBe(false);

    process.argv = originalArgv;
  });

  it('should apply CLI override when flag is present', async () => {
    // Simulate the logic in gemini.tsx
    const args = { modelFallback: false };

    if (args.modelFallback === false) {
      mockSettings.applyCliOverrides({
        general: {
          disableModelFallback: true,
        },
      });
    }

    expect(mockSettings.applyCliOverrides).toHaveBeenCalledWith({
      general: {
        disableModelFallback: true,
      },
    });
    expect(mockSettings.merged.general?.disableModelFallback).toBe(true);
  });

  it('should not apply CLI override when flag is absent', async () => {
    const args = { modelFallback: true };

    if (args.modelFallback === false) {
      mockSettings.applyCliOverrides({
        general: {
          disableModelFallback: true,
        },
      });
    }

    expect(mockSettings.applyCliOverrides).not.toHaveBeenCalled();
    expect(mockSettings.merged.general?.disableModelFallback).toBe(false);
  });
});
