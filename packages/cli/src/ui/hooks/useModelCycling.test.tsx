/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { useModelCycling } from './useModelCycling.js';
import { makeFakeConfig } from '@google/gemini-cli-core';

describe('useModelCycling', () => {
  let cycleModelsFn: (direction: 'forward' | 'backward') => void;

  function TestComponent() {
    const { cycleModels } = useModelCycling();
    cycleModelsFn = cycleModels;
    return null;
  }

  it('should cycle through all models if no favorites are set', async () => {
    const mockSetModel = vi.fn();
    const config = makeFakeConfig();
    config.setModel = mockSetModel;
    config.getModel = vi.fn().mockReturnValue('model-1');
    config.getModelConfigService = vi.fn().mockReturnValue({
      getAvailableModelOptions: vi.fn().mockReturnValue([
        { modelId: 'model-1', name: 'Model 1' },
        { modelId: 'model-2', name: 'Model 2' },
        { modelId: 'model-3', name: 'Model 3' },
      ]),
    });

    const settings = createMockSettings({
      model: { favorites: [] },
    });

    const { unmount } = await renderWithProviders(<TestComponent />, {
      config,
      settings,
    });

    await act(async () => {
      cycleModelsFn('forward');
    });

    expect(mockSetModel).toHaveBeenCalledWith('model-2', true);

    await act(async () => {
      cycleModelsFn('backward');
    });

    // Backwards from model-1 is model-3
    expect(mockSetModel).toHaveBeenCalledWith('model-3', true);

    unmount();
  });

  it('should cycle through only favorite models if set', async () => {
    const mockSetModel = vi.fn();
    const config = makeFakeConfig();
    config.setModel = mockSetModel;
    config.getModel = vi.fn().mockReturnValue('model-1');
    config.getModelConfigService = vi.fn().mockReturnValue({
      getAvailableModelOptions: vi.fn().mockReturnValue([
        { modelId: 'model-1', name: 'Model 1' },
        { modelId: 'model-2', name: 'Model 2' },
        { modelId: 'model-3', name: 'Model 3' },
      ]),
    });

    const settings = createMockSettings({
      model: { favorites: ['model-1', 'model-3'] },
    });

    const { unmount } = await renderWithProviders(<TestComponent />, {
      config,
      settings,
    });

    await act(async () => {
      cycleModelsFn('forward');
    });

    // Next favorite after model-1 is model-3
    expect(mockSetModel).toHaveBeenCalledWith('model-3', true);

    await act(async () => {
      // Update mock to simulate model-3 is now current
      vi.mocked(config.getModel).mockReturnValue('model-3');
      cycleModelsFn('forward');
    });

    // Next favorite after model-3 is model-1
    expect(mockSetModel).toHaveBeenCalledWith('model-1', true);

    unmount();
  });
});
