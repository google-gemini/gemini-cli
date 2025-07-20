/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CommandContext } from './types.js';
import { modelCommand } from './modelCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('modelCommand', () => {
  it('should return a dialog action', () => {
    const context: CommandContext = createMockCommandContext();

    const result = modelCommand.action(context, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });
});