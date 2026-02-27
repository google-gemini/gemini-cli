/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useTerminalCapabilities } from './useTerminalCapabilities.js';
import { useSettings } from '../contexts/SettingsContext.js';
import {
  detectTerminalEnvironment,
  getTerminalCapabilities,
  type TerminalEnvironment,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    detectTerminalEnvironment: vi.fn(),
    getTerminalCapabilities: vi.fn(),
  };
});

describe('useTerminalCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return terminal capabilities based on detection and settings', () => {
    const mockSettings = {
      merged: {
        ui: {
          compatibility: {
            forceAltBuffer: true,
          },
        },
      },
    } as unknown as LoadedSettings;
    vi.mocked(useSettings).mockReturnValue(mockSettings);

    const mockEnv = { isJetBrains: true } as TerminalEnvironment;
    vi.mocked(detectTerminalEnvironment).mockReturnValue(mockEnv);

    const mockCaps: ReturnType<typeof getTerminalCapabilities> = {
      capabilities: {
        supportsAltBuffer: true,
        supportsMouse: true,
        supportsReliableBackbufferClear: true,
      },
      warnings: [],
      reasons: {},
    };
    vi.mocked(getTerminalCapabilities).mockReturnValue(mockCaps);

    const { result } = renderHook(() => useTerminalCapabilities());

    expect(result.current).toEqual(mockCaps.capabilities);
    expect(detectTerminalEnvironment).toHaveBeenCalled();
    expect(getTerminalCapabilities).toHaveBeenCalledWith(
      mockEnv,
      process.env,
      expect.objectContaining({ forceAltBuffer: true }),
    );
  });

  it('should update when settings change', () => {
    const mockSettings1 = {
      merged: {
        ui: {
          compatibility: {
            forceAltBuffer: false,
          },
        },
      },
    } as unknown as LoadedSettings;
    vi.mocked(useSettings).mockReturnValue(mockSettings1);

    const mockEnv = { isJetBrains: false } as TerminalEnvironment;
    vi.mocked(detectTerminalEnvironment).mockReturnValue(mockEnv);

    const mockCaps1: ReturnType<typeof getTerminalCapabilities> = {
      capabilities: {
        supportsAltBuffer: false,
        supportsMouse: true,
        supportsReliableBackbufferClear: true,
      },
      warnings: [],
      reasons: {},
    };
    vi.mocked(getTerminalCapabilities).mockReturnValue(mockCaps1);

    const { result, rerender } = renderHook(() => useTerminalCapabilities());

    expect(result.current).toEqual(mockCaps1.capabilities);

    const mockSettings2 = {
      merged: {
        ui: {
          compatibility: {
            forceAltBuffer: true,
          },
        },
      },
    } as unknown as LoadedSettings;
    vi.mocked(useSettings).mockReturnValue(mockSettings2);

    const mockCaps2: ReturnType<typeof getTerminalCapabilities> = {
      capabilities: {
        supportsAltBuffer: true,
        supportsMouse: true,
        supportsReliableBackbufferClear: true,
      },
      warnings: [],
      reasons: {},
    };
    vi.mocked(getTerminalCapabilities).mockReturnValue(mockCaps2);

    rerender();

    expect(result.current).toEqual(mockCaps2.capabilities);
  });
});
