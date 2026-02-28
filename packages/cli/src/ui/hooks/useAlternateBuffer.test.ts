/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { createMockConfig } from '../../test-utils/mockConfig.js';
import {
  useAlternateBuffer,
  isAlternateBufferEnabled,
} from './useAlternateBuffer.js';
import type { TerminalCapabilities } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    detectTerminalEnvironment: vi.fn().mockReturnValue({}),
    getTerminalCapabilities: vi.fn().mockReturnValue({
      capabilities: {
        supportsAltBuffer: true,
        supportsMouse: true,
        supportsReliableBackbufferClear: true,
      } satisfies TerminalCapabilities,
      warnings: [],
      reasons: {},
    }),
  };
});

describe('useAlternateBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const { result } = renderHookWithProviders(() => useAlternateBuffer(), {
      useAlternateBuffer: false,
    });
    expect(result.current).toBe(false);
  });

  it('should return true when config.getUseAlternateBuffer returns true', () => {
    const { result } = renderHookWithProviders(() => useAlternateBuffer(), {
      useAlternateBuffer: true,
    });
    expect(result.current).toBe(true);
  });

  it('should return the immutable config value, not react to settings changes', () => {
    const { result, rerender } = renderHookWithProviders(
      () => useAlternateBuffer(),
      {
        useAlternateBuffer: true,
      },
    );

    // Value should remain true even after rerender
    expect(result.current).toBe(true);

    rerender();

    expect(result.current).toBe(true);
  });
});

describe('isAlternateBufferEnabled', () => {
  const defaultCaps: TerminalCapabilities = {
    supportsAltBuffer: true,
    supportsMouse: true,
    supportsReliableBackbufferClear: true,
  };

  it('should return true when config.getUseAlternateBuffer returns true', () => {
    const config = createMockConfig({
      getUseAlternateBuffer: vi.fn(() => true),
    });

    expect(isAlternateBufferEnabled(config, defaultCaps)).toBe(true);
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const config = createMockConfig({
      getUseAlternateBuffer: vi.fn(() => false),
    });

    expect(isAlternateBufferEnabled(config, defaultCaps)).toBe(false);
  });

  it('should return false when caps.supportsAltBuffer is false', () => {
    const config = createMockConfig({
      getUseAlternateBuffer: vi.fn(() => true),
    });

    expect(
      isAlternateBufferEnabled(config, {
        ...defaultCaps,
        supportsAltBuffer: false,
      }),
    ).toBe(false);
  });
});
