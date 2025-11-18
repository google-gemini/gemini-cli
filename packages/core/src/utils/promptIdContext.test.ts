/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { promptIdContext } from './promptIdContext.js';

describe('promptIdContext', () => {
  it('should be an instance of AsyncLocalStorage', () => {
    expect(promptIdContext).toBeInstanceOf(AsyncLocalStorage);
  });

  it('should store and retrieve prompt ID in async context', async () => {
    const testPromptId = 'test-prompt-123';

    await new Promise<void>((resolve) => {
      promptIdContext.run(testPromptId, () => {
        const retrieved = promptIdContext.getStore();
        expect(retrieved).toBe(testPromptId);
        resolve();
      });
    });
  });

  it('should return undefined when no context is set', () => {
    const retrieved = promptIdContext.getStore();
    expect(retrieved).toBeUndefined();
  });

  it('should handle nested contexts correctly', async () => {
    const outerPromptId = 'outer-prompt';
    const innerPromptId = 'inner-prompt';

    await new Promise<void>((resolve) => {
      promptIdContext.run(outerPromptId, () => {
        expect(promptIdContext.getStore()).toBe(outerPromptId);

        promptIdContext.run(innerPromptId, () => {
          expect(promptIdContext.getStore()).toBe(innerPromptId);
        });

        expect(promptIdContext.getStore()).toBe(outerPromptId);
        resolve();
      });
    });
  });
});
