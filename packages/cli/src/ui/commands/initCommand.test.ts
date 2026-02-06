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
import type { CommandContext } from './types.js';
import type { SubmitPromptActionReturn } from '@google/gemini-cli-core';

// Mock the 'fs' module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
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
        config: {
          getTargetDir: () => targetDir,
        },
      },
    });
  });

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks();
  });

  it('should inform the user if GEMINI.md already exists', async () => {
    // Arrange: Simulate that the file exists
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check for the correct informational message
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'A GEMINI.md file already exists in this directory. No changes were made. Use "init replace" to overwrite it.',
    });
    // Assert: Ensure no file was written
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should create GEMINI.md and submit a prompt if it does not exist', async () => {
    // Arrange: Simulate that the file does not exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

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

  it('should pass true for replace when argument is exactly "replace"', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = await initCommand.action!(mockContext, 'replace');

    // Should NOT show the "already exists" message because replace=true
    expect(result).not.toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'info',
      }),
    );
    // Should proceed to create file (submit_prompt)
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should pass false for replace when argument is "replace me" or other mismatch', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Case: "replace me"
    let result = await initCommand.action!(mockContext, 'replace me');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('already exists'),
    });

    // Case: "init" (empty args - usually empty string)
    result = await initCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('already exists'),
    });
  });

  it('should return an error if config is not available', async () => {
    // Arrange: Create a context without config
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.config = null;
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
});
