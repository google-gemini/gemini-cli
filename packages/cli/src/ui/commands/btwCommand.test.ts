/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { btwCommand } from './btwCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('btwCommand', () => {
  it('is safe to run concurrently and does not add the raw slash command to history', () => {
    expect(btwCommand.isSafeConcurrent).toBe(true);
    expect(btwCommand.shouldAddToHistory).toBe(false);
  });

  it('returns a btw action when prompt text is provided', async () => {
    const result = await btwCommand.action!(
      createMockCommandContext(),
      'why did the command fail?',
    );

    expect(result).toEqual({
      type: 'btw',
      prompt: 'why did the command fail?',
    });
  });

  it('returns a usage error when prompt text is missing', async () => {
    const result = await btwCommand.action!(createMockCommandContext(), '   ');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /btw <side question>',
    });
  });
});
