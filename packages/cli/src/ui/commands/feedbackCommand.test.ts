/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { feedbackCommand } from './feedbackCommand.js';
import { CommandContext, MessageActionReturn } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Settings } from '../../config/settings.js';

// Mock the telemetry functions
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    logResearchFeedback: vi.fn(),
    getInstallationId: vi.fn().mockReturnValue('mock-installation-id'),
  };
});

import { logResearchFeedback, makeFakeConfig } from '@google/gemini-cli-core';

// Create a mock context for testing
function createMockContext(settings: Partial<Settings>): CommandContext {
  return createMockCommandContext({
    services: {
      config: null,
      settings: {
        merged: settings as Settings,
        system: { settings: {}, path: '' },
        user: { settings: {}, path: '' },
        workspace: { settings: {}, path: '' },
        errors: [],
        forScope: vi.fn(),
        setValue: vi.fn(),
      },
      git: undefined,
      logger: {
        // Use actual Logger interface methods, not logEvent
        initialize: vi.fn(),
        logMessage: vi.fn(),
        saveCheckpoint: vi.fn(),
        loadCheckpoint: vi.fn(),
        deleteCheckpoint: vi.fn(),
        checkpointExists: vi.fn(),
        close: vi.fn(),
      },
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
      content: expect.stringContaining(
        'first opt-in to research participation',
      ),
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
    const mockConfig = makeFakeConfig({ telemetry: { enabled: true } });
    const context = createMockContext({
      researchOptIn: true,
      researchContact: 'user@example.com',
    });
    context.services.config = mockConfig;

    const feedbackText = 'This is great feedback';
    const result = await feedbackCommand.action!(context, feedbackText);

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('Thank you for your feedback'),
    });

    // Verify telemetry logging was called with expected parameters
    expect(logResearchFeedback).toHaveBeenCalledOnce();
    expect(logResearchFeedback).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({
        feedback_content: feedbackText,
        feedback_type: 'conversational',
      }),
    );
  });

  it('should always log research feedback when config exists', async () => {
    const mockConfig = makeFakeConfig({ telemetry: { enabled: false } });
    const context = createMockContext({
      researchOptIn: true,
    });
    context.services.config = mockConfig;

    await feedbackCommand.action!(context, 'Test feedback');

    // Verify research feedback logging was called regardless of telemetry setting
    // The logResearchFeedback function handles internal routing based on different settings
    expect(logResearchFeedback).toHaveBeenCalled();
  });

  it('should return error when services.config is missing', async () => {
    const context = createMockContext({
      researchOptIn: true,
    });
    context.services.config = null; // Simulate missing config

    const result = (await feedbackCommand.action!(
      context,
      'Test feedback',
    )) as MessageActionReturn;

    expect(result).toBeDefined();
    expect(result.type).toBe('message');
    expect(result.messageType).toBe('error');
    expect(result.content).toBe(
      'Unable to send feedback due to an internal configuration error. Please try again later.',
    );

    // Verify logging was NOT called when config is missing
    expect(logResearchFeedback).not.toHaveBeenCalled();
  });

  it('should handle multi-byte characters (emoji) correctly in feedback', async () => {
    const mockConfig = makeFakeConfig({ telemetry: { enabled: true } });
    const context = createMockContext({
      researchOptIn: true,
    });
    context.services.config = mockConfig;
    const feedbackWithEmoji =
      'This CLI is great! 👍🎉 Love the new features 💯';

    await feedbackCommand.action!(context, feedbackWithEmoji);

    // Verify the feedback event was created with the original multi-byte content
    expect(logResearchFeedback).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({
        feedback_content: feedbackWithEmoji,
        feedback_type: 'conversational',
      }),
    );
  });

  it('should have correct command metadata', () => {
    expect(feedbackCommand.name).toBe('feedback');
    expect(feedbackCommand.altNames).toContain('research');
    expect(feedbackCommand.description).toContain('help improve Gemini CLI');
  });
});
