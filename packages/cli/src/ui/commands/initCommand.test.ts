/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initCommand } from './initCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext, SlashCommandActionReturn } from './types.js';
import type { SubmitPromptActionReturn } from '@google/gemini-cli-core';

// Mock the 'fs' module
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
    writeFileSync: vi.fn(),
  };
});

describe('initCommand', () => {
  let mockContext: CommandContext;
  const targetDir = '/test/dir';
  const geminiMdPath = path.join(targetDir, 'GEMINI.md');

  beforeEach(() => {
    // Create a fresh mock context for each test
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getTargetDir: () => targetDir,
          },
        },
      },
    });
  });

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks();
  });

  it('should create GEMINI.md and submit a prompt if it does not exist', async () => {
    // Arrange: Simulate that the file does not exist (ENOENT error)
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce({
      code: 'ENOENT',
    } as NodeJS.ErrnoException);

    // Act: Run the command's action
    const result = (await initCommand.action!(
      mockContext,
      '',
    )) as SubmitPromptActionReturn;

    // Assert: Check that writeFileSync was called correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(geminiMdPath, '', 'utf8');

    // Assert: Check that an informational message was added to the UI
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: 'Empty GEMINI.md created. Now analyzing the project to populate it.',
      },
      expect.any(Number),
    );

    // Assert: Check that the correct prompt is submitted
    expect(result.type).toBe('submit_prompt');
    expect(result.content).toContain(
      'You are an AI agent that brings the power of Gemini',
    );
  });

  it('should return a message if GEMINI.md already exists with content', async () => {
    // Arrange: Simulate that the file exists with content
    const existingContent =
      '# Gemini Configuration\nSome existing configuration';
    vi.mocked(fs.promises.readFile).mockResolvedValueOnce(existingContent);

    // Act: Run the command's action
    const result = (await initCommand.action!(
      mockContext,
      '',
    )) as SlashCommandActionReturn;

    // Assert: Check that writeFileSync was NOT called
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    // Assert: Check that a message is returned (not a prompt submission)
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('info');
      expect(result.content).toBe(
        'A GEMINI.md file already exists in this directory. No changes were made.',
      );
    }
  });

  it('should create GEMINI.md if it exists but is empty', async () => {
    // Arrange: Simulate that the file exists but is empty
    vi.mocked(fs.promises.readFile).mockResolvedValueOnce('   \n  ');

    // Act: Run the command's action
    const result = (await initCommand.action!(
      mockContext,
      '',
    )) as SubmitPromptActionReturn;

    // Assert: Check that writeFileSync was called correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(geminiMdPath, '', 'utf8');

    // Assert: Check that the correct prompt is submitted
    expect(result.type).toBe('submit_prompt');
  });

  it('should return an error if config is not available', async () => {
    // Arrange: Create a context without config
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.agentContext = null;
    }

    // Act: Run the command's action
    const result = await initCommand.action!(noConfigContext, '');

    // Assert: Check for the correct error message
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });

  it('should return an error if reading GEMINI.md fails for reasons other than ENOENT', async () => {
    // Arrange: Simulate a read error (permission denied, etc.)
    const readError = new Error('Permission denied');
    (readError as NodeJS.ErrnoException).code = 'EACCES';
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce(readError);

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check for the correct error message
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to read GEMINI.md: Permission denied',
    });
    // Assert: Ensure no file was written
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
