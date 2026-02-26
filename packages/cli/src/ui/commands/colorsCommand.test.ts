/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { colorsCommand } from './colorsCommand.js';
import { CommandKind, type CommandContext } from './types.js';

describe('colorsCommand', () => {
  it('should have the correct metadata', () => {
    expect(colorsCommand.name).toBe('colors');
    expect(colorsCommand.description).toBe(
      'Visualize the current theme colors',
    );
    expect(colorsCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(colorsCommand.autoExecute).toBe(true);
  });

  it('should add a COLORS message to the UI', () => {
    const mockAddItem = vi.fn();
    const mockContext = {
      ui: {
        addItem: mockAddItem,
      },
    } as unknown as CommandContext;

    void colorsCommand.action?.(mockContext, '');

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'colors',
      }),
    );
  });
});
