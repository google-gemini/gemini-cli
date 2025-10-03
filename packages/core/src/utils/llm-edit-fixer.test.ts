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
import type { BaseLlmClient } from '../core/baseLlmClient.js';

// Mock the BaseLlmClient
const mockGenerateJson = vi.fn();
const mockBaseLlmClient = {
  generateJson: mockGenerateJson,
} as unknown as BaseLlmClient;

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

    await promptIdContext.run(testPromptId, async () => {
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
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
      mockBaseLlmClient,
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
    const promptId = 'test-prompt-id-prompt-construction';

    await promptIdContext.run(promptId, async () => {
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
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

    await promptIdContext.run(testPromptId, async () => {
      // First call - should call the API
      const result1 = await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
        abortSignal,
      );

      // Second call with identical parameters - should hit the cache
      const result2 = await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
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

    await promptIdContext.run(testPromptId, async () => {
      // First call
      await FixLLMEditWithInstruction(
        instruction,
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
        abortSignal,
      );

      // Second call with a different instruction
      await FixLLMEditWithInstruction(
        'A different instruction',
        old_string,
        new_string,
        error,
        current_content,
        mockBaseLlmClient,
        abortSignal,
      );

      // Verify the underlying service was called TWICE
      expect(mockGenerateJson).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache collision prevention', () => {
    it('should prevent cache collisions when parameters contain separator sequences', async () => {
      // This test would have failed with the old string concatenation approach
      // but passes with JSON.stringify implementation

      const firstResponse: SearchReplaceEdit = {
        search: 'original text',
        replace: 'first replacement',
        noChangesRequired: false,
        explanation: 'First edit correction',
      };

      const secondResponse: SearchReplaceEdit = {
        search: 'different text',
        replace: 'second replacement',
        noChangesRequired: false,
        explanation: 'Second edit correction',
      };

      mockGenerateJson
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const testPromptId = 'cache-collision-test';

      await promptIdContext.run(testPromptId, async () => {
        // Scenario 1: Parameters that would create collision with string concatenation
        // Cache key with old method would be: "Fix YAML---content---update--some---data--error"
        const call1 = await FixLLMEditWithInstruction(
          'Fix YAML', // instruction
          'content', // old_string
          'update--some', // new_string (contains --)
          'data', // current_content
          'error', // error
          mockBaseLlmClient,
          abortSignal,
        );

        // Scenario 2: Different parameters that would create same cache key with concatenation
        // Cache key with old method would be: "Fix YAML---content---update--some---data--error"
        const call2 = await FixLLMEditWithInstruction(
          'Fix YAML---content---update', // instruction (contains ---)
          'some---data', // old_string (contains ---)
          'error', // new_string
          '', // current_content
          '', // error
          mockBaseLlmClient,
          abortSignal,
        );

        // With the fixed JSON.stringify approach, these should be different
        // and each should get its own LLM response
        expect(call1).toEqual(firstResponse);
        expect(call2).toEqual(secondResponse);
        expect(call1).not.toEqual(call2);

        // Most importantly: the LLM should be called TWICE, not once
        // (proving no cache collision occurred)
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle YAML frontmatter without cache collisions', async () => {
      // Real-world test case with YAML frontmatter containing ---

      const yamlResponse: SearchReplaceEdit = {
        search: '---\ntitle: Old\n---',
        replace: '---\ntitle: New\n---',
        noChangesRequired: false,
        explanation: 'Updated YAML frontmatter',
      };

      const contentResponse: SearchReplaceEdit = {
        search: 'old content',
        replace: 'new content',
        noChangesRequired: false,
        explanation: 'Updated content',
      };

      mockGenerateJson
        .mockResolvedValueOnce(yamlResponse)
        .mockResolvedValueOnce(contentResponse);

      const testPromptId = 'yaml-frontmatter-test';

      await promptIdContext.run(testPromptId, async () => {
        // Call 1: Edit YAML frontmatter
        const yamlEdit = await FixLLMEditWithInstruction(
          'Update YAML frontmatter',
          '---\ntitle: Old\n---', // Contains ---
          '---\ntitle: New\n---', // Contains ---
          'Some markdown content',
          'YAML parse error',
          mockBaseLlmClient,
          abortSignal,
        );

        // Call 2: Edit regular content
        const contentEdit = await FixLLMEditWithInstruction(
          'Update content',
          'old content',
          'new content',
          'Different file content',
          'Content not found',
          mockBaseLlmClient,
          abortSignal,
        );

        // Verify both calls succeeded with different results
        expect(yamlEdit).toEqual(yamlResponse);
        expect(contentEdit).toEqual(contentResponse);
        expect(yamlEdit).not.toEqual(contentEdit);

        // Verify no cache collision - both calls should hit the LLM
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
      });
    });
  });
});
