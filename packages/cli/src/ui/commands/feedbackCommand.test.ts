/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { feedbackCommand } from './feedbackCommand.js';
import { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Settings } from '../../config/settings.js';

// Create a mock context for testing
function createMockContext(settings: Partial<Settings>): CommandContext {
  return createMockCommandContext({
    services: {
      config: null,
      settings: {
        merged: settings as Settings,
      } as any,
      git: undefined,
      logger: {
        logEvent: vi.fn(),
      } as any,
    },
  });
}

describe('feedbackCommand', () => {
  it('should prompt user to opt-in when not opted in', async () => {
    const context = createMockContext({ researchOptIn: false });
    const result = await feedbackCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('first opt-in to research participation'),
    });
  });

  it('should prompt for feedback when opted in but no args provided', async () => {
    const context = createMockContext({ researchOptIn: true });
    const result = await feedbackCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('Please provide your feedback'),
    });
  });

  it('should accept feedback when opted in with args', async () => {
    const context = createMockContext({ 
      researchOptIn: true,
      researchContact: 'user@example.com',
    });
    const result = await feedbackCommand.action!(context, 'This is great feedback');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('Thank you for your feedback'),
    });
  });

  it('should have correct command metadata', () => {
    expect(feedbackCommand.name).toBe('feedback');
    expect(feedbackCommand.altNames).toContain('research');
    expect(feedbackCommand.description).toContain('help improve Gemini CLI');
  });
});