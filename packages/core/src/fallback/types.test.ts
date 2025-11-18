/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { FallbackIntent, FallbackModelHandler } from './types.js';

describe('fallback types', () => {
  describe('FallbackIntent', () => {
    it('should accept "retry" as valid intent', () => {
      const intent: FallbackIntent = 'retry';
      expect(intent).toBe('retry');
    });

    it('should accept "stop" as valid intent', () => {
      const intent: FallbackIntent = 'stop';
      expect(intent).toBe('stop');
    });

    it('should accept "auth" as valid intent', () => {
      const intent: FallbackIntent = 'auth';
      expect(intent).toBe('auth');
    });

    it('should be a string type', () => {
      const intent: FallbackIntent = 'retry';
      expect(typeof intent).toBe('string');
    });
  });

  describe('FallbackModelHandler', () => {
    it('should accept function that returns Promise<FallbackIntent>', async () => {
      const handler: FallbackModelHandler = async (
        _failedModel,
        _fallbackModel,
      ) => 'retry';

      const result = await handler('model1', 'model2');
      expect(result).toBe('retry');
    });

    it('should accept function that returns Promise<null>', async () => {
      const handler: FallbackModelHandler = async () => null;

      const result = await handler('model1', 'model2');
      expect(result).toBeNull();
    });

    it('should accept function with error parameter', async () => {
      const handler: FallbackModelHandler = async (
        _failedModel,
        _fallbackModel,
        error,
      ) => {
        expect(error).toBeDefined();
        return 'retry';
      };

      const result = await handler('model1', 'model2', new Error('test'));
      expect(result).toBe('retry');
    });

    it('should accept function without error parameter', async () => {
      const handler: FallbackModelHandler = async (
        failedModel,
        fallbackModel,
      ) => {
        expect(failedModel).toBe('model1');
        expect(fallbackModel).toBe('model2');
        return 'stop';
      };

      const result = await handler('model1', 'model2');
      expect(result).toBe('stop');
    });

    it('should handle all intent types', async () => {
      const intents: FallbackIntent[] = ['retry', 'stop', 'auth'];

      for (const intent of intents) {
        const handler: FallbackModelHandler = async () => intent;
        const result = await handler('m1', 'm2');
        expect(result).toBe(intent);
      }
    });

    it('should be async function', () => {
      const handler: FallbackModelHandler = async () => 'retry';
      const result = handler('m1', 'm2');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should accept different model names', async () => {
      const handler: FallbackModelHandler = async (failed, fallback) => {
        if (failed === 'expensive-model' && fallback === 'cheap-model') {
          return 'retry';
        }
        return null;
      };

      const result = await handler('expensive-model', 'cheap-model');
      expect(result).toBe('retry');
    });

    it('should accept error of any type', async () => {
      const handler: FallbackModelHandler = async (_, __, error) => {
        if (typeof error === 'string') return 'retry';
        if (error instanceof Error) return 'stop';
        return 'auth';
      };

      expect(await handler('m1', 'm2', 'string error')).toBe('retry');
      expect(await handler('m1', 'm2', new Error())).toBe('stop');
      expect(await handler('m1', 'm2', { custom: 'error' })).toBe('auth');
    });
  });
});
