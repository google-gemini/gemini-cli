/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { missionCommand } from './missionCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext, SlashCommandActionReturn } from './types.js';

describe('missionCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return error if request is empty', async () => {
    const result = (await missionCommand.action!(
      mockContext,
      '',
    )) as SlashCommandActionReturn;
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('error');
    }
  });

  it('should return submit_prompt if request is provided', async () => {
    const request = 'Refactor the tokenizer';
    const result = (await missionCommand.action!(
      mockContext,
      request,
    )) as SlashCommandActionReturn;
    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toContain(request);
    }
  });
});
