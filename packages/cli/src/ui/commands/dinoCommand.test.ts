/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { dinoCommand } from './dinoCommand.js';
import { CommandKind } from './types.js';

describe('dinoCommand', () => {
  it('should have the correct name and description', () => {
    expect(dinoCommand.name).toBe('dino');
    expect(dinoCommand.description).toBe('Play the dino game');
    expect(dinoCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return a dialog action', async () => {
    if (!dinoCommand.action) {
      throw new Error('dinoCommand.action is undefined');
    }

    // Mock context is not needed for this simple command
    // @ts-expect-error - mock context not needed
    const result = await dinoCommand.action({}, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'dino',
    });
  });
});
