/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mocked } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

// MOCKS
let callCount = 0;
const mockResponses: any[] = [];

let mockGenerateJson: any;

// END MOCKS

import {
  ensureCorrectFileContent,
  unescapeStringForGeminiBug,
  resetEditCorrectorCaches_TEST_ONLY,
} from './editCorrector.js';

describe('editCorrector', () => {
  describe('unescapeStringForGeminiBug', () => {
    it('should unescape common sequences', () => {
      expect(unescapeStringForGeminiBug('\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug("\\'")).toBe("'");
      expect(unescapeStringForGeminiBug('\\"')).toBe('"');
      expect(unescapeStringForGeminiBug('\\`')).toBe('`');
    });
    it('should handle multiple escaped sequences', () => {
      expect(unescapeStringForGeminiBug('Hello\\nWorld\\tTest')).toBe(
        'Hello\nWorld\tTest',
      );
    });
    it('should not alter already correct sequences', () => {
      expect(unescapeStringForGeminiBug('\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('Correct string')).toBe(
        'Correct string',
      );
    });
    it('should handle mixed correct and incorrect sequences', () => {
      expect(unescapeStringForGeminiBug('\\nCorrect\t\\`')).toBe(
        '\nCorrect\t`',
      );
    });
    it('should handle backslash followed by actual newline character', () => {
      expect(unescapeStringForGeminiBug('\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('First line\\\nSecond line')).toBe(
        'First line\nSecond line',
      );
    });
    it('should handle multiple backslashes before an escapable character (aggressive unescaping)', () => {
      expect(unescapeStringForGeminiBug('\\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\\\\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug('\\\\\\\\`')).toBe('`');
    });
    it('should return empty string for empty input', () => {
      expect(unescapeStringForGeminiBug('')).toBe('');
    });
    it('should not alter strings with no targeted escape sequences', () => {
      expect(unescapeStringForGeminiBug('abc def')).toBe('abc def');
      expect(unescapeStringForGeminiBug('C:\\Folder\\File')).toBe(
        'C:\\Folder\\File',
      );
    });
    it('should correctly process strings with some targeted escapes', () => {
      expect(unescapeStringForGeminiBug('C:\\Users\\name')).toBe(
        'C:\\Users\name',
      );
    });
    it('should handle complex cases with mixed slashes and characters', () => {
      expect(
        unescapeStringForGeminiBug('\\\\\\\nLine1\\\nLine2\\tTab\\\\`Tick\\"'),
      ).toBe('\nLine1\nLine2\tTab`Tick"');
    });
    it('should handle escaped backslashes', () => {
      expect(unescapeStringForGeminiBug('\\\\')).toBe('\\');
      expect(unescapeStringForGeminiBug('C:\\\\Users')).toBe('C:\\Users');
      expect(unescapeStringForGeminiBug('path\\\\to\\\\file')).toBe(
        'path\to\\file',
      );
    });
    it('should handle escaped backslashes mixed with other escapes (aggressive unescaping)', () => {
      expect(unescapeStringForGeminiBug('line1\\\\\\nline2')).toBe(
        'line1\nline2',
      );
      expect(unescapeStringForGeminiBug('quote\\\\"text\\\\nline')).toBe(
        'quote"text\nline',
      );
    });
  });

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

    it('should return unescaped content when LLM is disabled and aggressiveUnescape is true', async () => {
      const content = 'LaTeX command \\\\title{Example}';
      // unescapeStringForGeminiBug would change \\\\title to \title (literal tab and "itle")
      const expected = 'LaTeX command \title{Example}';

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        true, // disableLLMCorrection
        true, // aggressiveUnescape
      );

      expect(result).toBe(expected);
      expect(mockGenerateJson).not.toHaveBeenCalled();
    });

    it('should return original content when LLM is disabled and aggressiveUnescape is false', async () => {
      const content = 'LaTeX command \\\\title{Example}';

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        true, // disableLLMCorrection
        false, // aggressiveUnescape
      );

      expect(result).toBe(content);
      expect(mockGenerateJson).not.toHaveBeenCalled();
    });
  });
});
