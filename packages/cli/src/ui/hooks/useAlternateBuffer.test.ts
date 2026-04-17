/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import {
  useAlternateBuffer,
  isAlternateBufferEnabled,
} from './useAlternateBuffer.js';
import type { Config } from '@google/gemini-cli-core';
import { ConfigContext } from '../contexts/ConfigContext.js';
import React from 'react';

// Removed vi.mock for ConfigContext

describe('useAlternateBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when config.getUseAlternateBuffer returns false', async () => {
    const mockConfig = {
      getUseAlternateBuffer: () => false,
      getUseTerminalBuffer: () => false,
    } as unknown as Config;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ConfigContext.Provider,
        { value: mockConfig },
        children,
      );

    const { result } = await renderHook(() => useAlternateBuffer(), {
      wrapper,
    });
    expect(result.current).toBe(false);
  });

  it('should return true when config.getUseAlternateBuffer returns true', async () => {
    const mockConfig = {
      getUseAlternateBuffer: () => true,
      getUseTerminalBuffer: () => false,
    } as unknown as Config;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ConfigContext.Provider,
        { value: mockConfig },
        children,
      );

    const { result } = await renderHook(() => useAlternateBuffer(), {
      wrapper,
    });
    expect(result.current).toBe(true);
  });

  it('should return the immutable config value, not react to settings changes', async () => {
    const mockConfig = {
      getUseAlternateBuffer: () => true,
      getUseTerminalBuffer: () => false,
    } as unknown as Config;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ConfigContext.Provider,
        { value: mockConfig },
        children,
      );

    const { result, rerender } = await renderHook(() => useAlternateBuffer(), {
      wrapper,
    });

    // Value should remain true even after rerender
    expect(result.current).toBe(true);

    rerender();

    expect(result.current).toBe(true);
  });
});

describe('isAlternateBufferEnabled', () => {
  it('should return true when config.getUseAlternateBuffer returns true', () => {
    const config = {
      getUseAlternateBuffer: () => true,
      getUseTerminalBuffer: () => false,
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(true);
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const config = {
      getUseAlternateBuffer: () => false,
      getUseTerminalBuffer: () => false,
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(false);
  });
});
