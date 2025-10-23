/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreToolScheduler } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useReactToolScheduler } from './useReactToolScheduler.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    CoreToolScheduler: vi.fn(),
  };
});

const mockCoreToolScheduler = vi.mocked(CoreToolScheduler);

describe('useReactToolScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only creates one instance of CoreToolScheduler even if props change', () => {
    const onComplete = vi.fn();
    const getPreferredEditor = vi.fn();
    const onEditorClose = vi.fn();
    const config = {} as Config;

    const { rerender } = renderHook(
      (props) =>
        useReactToolScheduler(
          props.onComplete,
          props.config,
          props.getPreferredEditor,
          props.onEditorClose,
        ),
      {
        initialProps: {
          onComplete,
          config,
          getPreferredEditor,
          onEditorClose,
        },
      },
    );

    expect(mockCoreToolScheduler).toHaveBeenCalledTimes(1);

    // Rerender with a new onComplete function
    const newOnComplete = vi.fn();
    rerender({
      onComplete: newOnComplete,
      config,
      getPreferredEditor,
      onEditorClose,
    });
    expect(mockCoreToolScheduler).toHaveBeenCalledTimes(1);

    // Rerender with a new getPreferredEditor function
    const newGetPreferredEditor = vi.fn();
    rerender({
      onComplete: newOnComplete,
      config,
      getPreferredEditor: newGetPreferredEditor,
      onEditorClose,
    });
    expect(mockCoreToolScheduler).toHaveBeenCalledTimes(1);

    // Rerender with a new onEditorClose function
    const newOnEditorClose = vi.fn();
    rerender({
      onComplete: newOnComplete,
      config,
      getPreferredEditor: newGetPreferredEditor,
      onEditorClose: newOnEditorClose,
    });
    expect(mockCoreToolScheduler).toHaveBeenCalledTimes(1);
  });
});
