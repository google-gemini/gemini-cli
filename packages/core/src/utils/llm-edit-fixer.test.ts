/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FixLLMEditWithInstruction,
  resetLlmEditFixerCaches_TEST_ONLY,
  type SearchReplaceEdit,
} from './llm-edit-fixer.js';
import { promptIdContext } from './promptIdContext.js';
import type { LlmUtilityService } from '../core/llmUtilityService.js';

// Mock the LlmUtilityService
const mockGenerateJson = vi.fn();
const mockLlmUtilityService = {
  generateJson: mockGenerateJson,
} as unknown as LlmUtilityService;

describe('FixLLMEditWithInstruction', () => {
  const instruction = 'Replace the title';
  const old_string = '<h1>Old Title</h1>';
  const new_string = '<h1>New Title</h1>';
  const error = 'String not found';
  const current_content = '<body><h1>Old Title</h1></body>';
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  beforeEach(() => {
    vi.clearAllMocks();
    resetLlmEditFixerCaches_TEST_ONLY(); // Ensure cache is cleared before each test
  });

  afterEach(() => {
    vi.useRealTimers(); // Reset timers after each test
  });

  const mockApiResponse: SearchReplaceEdit = {
    search: '<h1>Old Title</h1>',
    replace: '<h1>New Title</h1>',
    noChangesRequired: false,
    explanation: 'The original search was correct.',
  };

  it('should use the promptId from the AsyncLocalStorage context when available', async () => {
    const testPromptId = 'test-prompt-id-12345';
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    // Run the function within the context
    await promptIdContext.run({ promptId: testPromptId }, async () => {
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );
    });

    // Verify that generateJson was called with the promptId from the context
    expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    expect(mockGenerateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: testPromptId,
      }),
    );
  });

  it('should generate and use a fallback promptId when context is not available', async () => {
    mockGenerateJson.mockResolvedValue(mockApiResponse);
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    // Run the function outside of any context
    await FixLLMEditWithInstruction(
      instruction,
      old_string,
      new_string,
      error,
      current_content,
      mockLlmUtilityService,
      abortSignal,
    );

    // Verify the warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context. This is unexpected. Using a fallback ID: llm-fixer-fallback-',
      ),
    );

    // Verify that generateJson was called with the generated fallback promptId
    expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    expect(mockGenerateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: expect.stringContaining('llm-fixer-fallback-'),
      }),
    );

    // Restore mocks
    consoleWarnSpy.mockRestore();
  });

  it('should construct the user prompt correctly', async () => {
    mockGenerateJson.mockResolvedValue(mockApiResponse);
    const testPromptId = 'test-prompt-id-prompt-construction';

    await promptIdContext.run({ promptId: testPromptId }, async () => {
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );
    });

    const generateJsonCall = mockGenerateJson.mock.calls[0][0];
    const userPromptContent = generateJsonCall.contents[0].parts[0].text;

    expect(userPromptContent).toContain(
      `<instruction>\n${instruction}\n</instruction>`,
    );
    expect(userPromptContent).toContain(`<search>\n${old_string}\n</search>`);
    expect(userPromptContent).toContain(`<replace>\n${new_string}\n</replace>`);
    expect(userPromptContent).toContain(`<error>\n${error}\n</error>`);
    expect(userPromptContent).toContain(
      `<file_content>\n${current_content}\n</file_content>`,
    );
  });

  it('should return a cached result on subsequent identical calls', async () => {
    mockGenerateJson.mockResolvedValue(mockApiResponse);
    const testPromptId = 'test-prompt-id-caching';

    await promptIdContext.run({ promptId: testPromptId }, async () => {
      // First call - should call the API
      const result1 = await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );

      // Second call with identical parameters - should hit the cache
      const result2 = await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );

      expect(result1).toEqual(mockApiResponse);
      expect(result2).toEqual(mockApiResponse);
      // Verify the underlying service was only called ONCE
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });
  });

  it('should not use cache for calls with different parameters', async () => {
    mockGenerateJson.mockResolvedValue(mockApiResponse);
    const testPromptId = 'test-prompt-id-cache-miss';

    await promptIdContext.run({ promptId: testPromptId }, async () => {
      // First call
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );

      // Second call with a different instruction
      await FixLLMEditWithInstruction(
        'A different instruction',
        old_string,
        new_string,
        error,
        current_content,
        mockLlmUtilityService,
        abortSignal,
      );

      // Verify the underlying service was called TWICE
      expect(mockGenerateJson).toHaveBeenCalledTimes(2);
    });
  });
});
