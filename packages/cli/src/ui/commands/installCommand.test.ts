/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installCommand } from './installCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('installCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should show deprecation message when invoked with no args', async () => {
    const result = await installCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('/theme install'),
    });
  });

  it('should show same deprecation message for any args (legacy paths)', async () => {
    const result = await installCommand.action!(mockContext, 'anything here');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('/theme install'),
    });
  });

  it('should have deprecated description', () => {
    expect(installCommand.name).toBe('install');
    expect(installCommand.description).toBe(
      'deprecated: use /theme install instead',
    );
  });
});
