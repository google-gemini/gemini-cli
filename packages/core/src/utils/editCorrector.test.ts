/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi, describe, it, expect, beforeEach, type Mocked } from 'vitest';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

// MOCKS
let callCount = 0;
const mockResponses: any[] = [];

let mockGenerateJson: any;

// END MOCKS

import {
  ensureCorrectFileContent,
  resetEditCorrectorCaches_TEST_ONLY,
} from './editCorrector.js';

describe('editCorrector', () => {
  describe('ensureCorrectFileContent', () => {
    let mockBaseLlmClientInstance: Mocked<BaseLlmClient>;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      callCount = 0;
      mockResponses.length = 0;
      mockGenerateJson = vi
        .fn()
        .mockImplementation((_contents, _schema, signal) => {
          if (signal && signal.aborted) {
            return Promise.reject(new Error('Aborted'));
          }
          const response = mockResponses[callCount];
          callCount++;
          if (response === undefined) return Promise.resolve({});
          return Promise.resolve(response);
        });

      mockBaseLlmClientInstance = {
        generateJson: mockGenerateJson,
        config: {
          generationConfigService: {
            getResolvedConfig: vi.fn().mockReturnValue({
              model: 'edit-corrector',
              generateContentConfig: {},
            }),
          },
        },
      } as unknown as Mocked<BaseLlmClient>;
      resetEditCorrectorCaches_TEST_ONLY();
    });

    it('should return content unchanged if no escaping issues detected', async () => {
      const content = 'This is normal content without escaping issues';
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should call correctStringEscaping for potentially escaped content', async () => {
      const content = 'console.log(\\"Hello World\\");';
      const correctedContent = 'console.log("Hello World");';
      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(correctedContent);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should handle correctStringEscaping returning corrected content via correct property name', async () => {
      // This test specifically verifies the property name fix
      const content = 'const message = \\"Hello\\nWorld\\";';
      const correctedContent = 'const message = "Hello\nWorld";';

      // Mock the response with the correct property name
      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(correctedContent);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should return original content if LLM correction fails', async () => {
      const content = 'console.log(\\"Hello World\\");';
      // Mock empty response to simulate LLM failure
      mockResponses.push({});

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should handle various escape sequences that need correction', async () => {
      const content =
        'const obj = { name: \\"John\\", age: 30, bio: \\"Developer\\nEngineer\\" };';
      const correctedContent =
        'const obj = { name: "John", age: 30, bio: "Developer\nEngineer" };';

      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(correctedContent);
    });

    it('should return original content when LLM is disabled', async () => {
      const content = 'LaTeX command \\\\title{Example}';

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        true, // disableLLMCorrection
      );

      expect(result).toBe(content);
      expect(mockGenerateJson).not.toHaveBeenCalled();
    });
  });
});
