/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';
import { createMockCommandContext } from './mockCommandContext.js';

describe('createMockCommandContext', () => {
  it('should return a valid CommandContext object with default mocks', () => {
    const context = createMockCommandContext();

    // Just a few spot checks to ensure the structure is correct
    // and functions are mocks.
    expect(context).toBeDefined();
    expect(context.ui.addItem).toBeInstanceOf(Function);
    expect(vi.isMockFunction(context.ui.addItem)).toBe(true);
  });

  it('should apply top-level overrides correctly', () => {
    const mockShowHelp = vi.fn();
    const overrides = {
      dialogs: {
        setShowHelp: mockShowHelp,
      },
    };

    const context = createMockCommandContext(overrides);

    // Call the function to see if the override was used
    context.dialogs.setShowHelp(true);

    // Assert that our specific mock was called, not the default
    expect(mockShowHelp).toHaveBeenCalledWith(true);
    // And that other defaults are still in place
    expect(vi.isMockFunction(context.dialogs.openAuth)).toBe(true);
  });

  it('should apply deeply nested overrides correctly', () => {
    // This is the most important test for factory's logic.
    const mockConfig = {
      getProjectRoot: () => '/test/project',
      getModel: () => 'gemini-pro',
    };

    const overrides = {
      services: {
        config: mockConfig,
      },
    };

    const context = createMockCommandContext(overrides);

    expect(context.services.config).toBeDefined();
    expect(context.services.config?.getModel()).toBe('gemini-pro');
    expect(context.services.config?.getProjectRoot()).toBe('/test/project');

    // Verify a default property on the same nested object is still there
    expect(context.services.logger).toBeDefined();
  });
});
