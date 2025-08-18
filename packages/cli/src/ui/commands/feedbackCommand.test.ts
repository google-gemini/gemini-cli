/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { feedbackCommand } from './feedbackCommand.js';
import { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Settings } from '../../config/settings.js';

// Mock the telemetry functions
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    logResearchFeedback: vi.fn(),
  };
});

import { logResearchFeedback, ResearchFeedbackEvent } from '@google/gemini-cli-core';

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
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });
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

  it('should accept feedback and log telemetry event when opted in with args', async () => {
    const mockConfig = { getTelemetryEnabled: () => true };
    const context = createMockContext({ 
      researchOptIn: true,
      researchContact: 'user@example.com',
    });
    context.services.config = mockConfig as any;

    const feedbackText = 'This is great feedback';
    const result = await feedbackCommand.action!(context, feedbackText);

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('Thank you for your feedback'),
    });

    // Verify telemetry logging was called
    expect(vi.mocked(logResearchFeedback)).toHaveBeenCalledOnce();
    const [configArg, eventArg] = vi.mocked(logResearchFeedback).mock.calls[0];
    expect(configArg).toBe(mockConfig);
    expect(eventArg).toBeInstanceOf(ResearchFeedbackEvent);
    expect(eventArg.feedback_content).toBe(feedbackText);
    expect(eventArg.feedback_type).toBe('conversational');
  });

  it('should not log telemetry when telemetry is disabled', async () => {
    const mockConfig = { getTelemetryEnabled: () => false };
    const context = createMockContext({ 
      researchOptIn: true,
    });
    context.services.config = mockConfig as any;

    await feedbackCommand.action!(context, 'Test feedback');

    // Verify telemetry logging was NOT called when disabled
    expect(vi.mocked(logResearchFeedback)).not.toHaveBeenCalled();
  });

  it('should have correct command metadata', () => {
    expect(feedbackCommand.name).toBe('feedback');
    expect(feedbackCommand.altNames).toContain('research');
    expect(feedbackCommand.description).toContain('help improve Gemini CLI');
  });
});