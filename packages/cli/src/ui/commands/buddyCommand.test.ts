/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { getBuddyState, resetBuddyState, setBuddyStatus } from '../companion/BuddyState.js';
import { buddyCommand } from './buddyCommand.js';
import type { SlashCommandActionReturn } from './types.js';

describe('buddyCommand', () => {
  beforeEach(() => {
    resetBuddyState();
  });

  it('toggles Pollux on and off', async () => {
    const context = createMockCommandContext();

    const on = (await buddyCommand.action!(
      context,
      '',
    )) as SlashCommandActionReturn;
    expect(on.type).toBe('message');
    expect(getBuddyState().visible).toBe(true);

    const off = (await buddyCommand.action!(
      context,
      'off',
    )) as SlashCommandActionReturn;
    expect(off.type).toBe('message');
    expect(getBuddyState().visible).toBe(false);
  });

  it('reports status', async () => {
    const context = createMockCommandContext();
    setBuddyStatus('busy', 'Dev build is catching up.');

    const result = (await buddyCommand.action!(
      context,
      'status',
    )) as SlashCommandActionReturn;

    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('busy');
      expect(result.content).toContain('Dev build is catching up.');
    }
  });

  it('rejects unknown buddy subcommands', async () => {
    const result = (await buddyCommand.action!(
      createMockCommandContext(),
      'dance',
    )) as SlashCommandActionReturn;

    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('error');
    }
  });
});
