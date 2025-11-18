/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { JsonError, JsonOutput } from './types.js';
import { OutputFormat } from './types.js';

describe('output types', () => {
  describe('OutputFormat enum', () => {
    it('should have TEXT format', () => {
      expect(OutputFormat.TEXT).toBe('text');
    });

    it('should have JSON format', () => {
      expect(OutputFormat.JSON).toBe('json');
    });

    it('should have exactly 2 output formats', () => {
      const formatKeys = Object.keys(OutputFormat);
      expect(formatKeys).toHaveLength(2);
    });

    it('should use lowercase values', () => {
      const formatValues = Object.values(OutputFormat);
      formatValues.forEach((value) => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should have different values for each format', () => {
      expect(OutputFormat.TEXT).not.toBe(OutputFormat.JSON);
    });
  });

  describe('JsonError interface', () => {
    it('should accept valid JsonError with type and message', () => {
      const error: JsonError = {
        type: 'ValidationError',
        message: 'Invalid input',
      };

      expect(error.type).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBeUndefined();
    });

    it('should accept JsonError with string code', () => {
      const error: JsonError = {
        type: 'ApiError',
        message: 'API request failed',
        code: 'ERR_API_FAILURE',
      };

      expect(error.code).toBe('ERR_API_FAILURE');
      expect(typeof error.code).toBe('string');
    });

    it('should accept JsonError with numeric code', () => {
      const error: JsonError = {
        type: 'HttpError',
        message: 'Not found',
        code: 404,
      };

      expect(error.code).toBe(404);
      expect(typeof error.code).toBe('number');
    });

    it('should accept JsonError without optional code', () => {
      const error: JsonError = {
        type: 'Error',
        message: 'Something went wrong',
      };

      expect(error).toBeDefined();
      expect('code' in error).toBe(false);
    });
  });

  describe('JsonOutput interface', () => {
    it('should accept empty JsonOutput', () => {
      const output: JsonOutput = {};
      expect(output).toBeDefined();
      expect(Object.keys(output)).toHaveLength(0);
    });

    it('should accept JsonOutput with only response', () => {
      const output: JsonOutput = {
        response: 'Success',
      };

      expect(output.response).toBe('Success');
      expect(output.stats).toBeUndefined();
      expect(output.error).toBeUndefined();
    });

    it('should accept JsonOutput with only error', () => {
      const output: JsonOutput = {
        error: {
          type: 'Error',
          message: 'Failed',
        },
      };

      expect(output.error).toBeDefined();
      expect(output.error?.type).toBe('Error');
      expect(output.response).toBeUndefined();
      expect(output.stats).toBeUndefined();
    });

    it('should accept JsonOutput with stats', () => {
      const output: JsonOutput = {
        stats: {
          totalTokensUsed: 1000,
          modelInputTokensUsed: 500,
          modelOutputTokensUsed: 500,
        },
      };

      expect(output.stats).toBeDefined();
      expect(output.stats?.totalTokensUsed).toBe(1000);
    });

    it('should accept JsonOutput with all fields', () => {
      const output: JsonOutput = {
        response: 'Success',
        stats: {
          totalTokensUsed: 1000,
          modelInputTokensUsed: 500,
          modelOutputTokensUsed: 500,
        },
        error: {
          type: 'Warning',
          message: 'Partial success',
          code: 'WARN_001',
        },
      };

      expect(output.response).toBe('Success');
      expect(output.stats).toBeDefined();
      expect(output.error).toBeDefined();
    });

    it('should accept JsonOutput with error containing numeric code', () => {
      const output: JsonOutput = {
        error: {
          type: 'HttpError',
          message: 'Server error',
          code: 500,
        },
      };

      expect(output.error?.code).toBe(500);
      expect(typeof output.error?.code).toBe('number');
    });

    it('should accept JsonOutput with error containing string code', () => {
      const output: JsonOutput = {
        error: {
          type: 'CustomError',
          message: 'Custom error message',
          code: 'CUSTOM_ERR',
        },
      };

      expect(output.error?.code).toBe('CUSTOM_ERR');
      expect(typeof output.error?.code).toBe('string');
    });
  });

  describe('type relationships', () => {
    it('should allow JsonError to be used in JsonOutput', () => {
      const error: JsonError = {
        type: 'TestError',
        message: 'Test message',
      };

      const output: JsonOutput = {
        error,
      };

      expect(output.error).toBe(error);
    });

    it('should support optional fields in JsonOutput', () => {
      const output1: JsonOutput = {};
      const output2: JsonOutput = { response: 'test' };
      const output3: JsonOutput = {
        error: { type: 'Error', message: 'msg' },
      };

      expect(output1).toBeDefined();
      expect(output2).toBeDefined();
      expect(output3).toBeDefined();
    });
  });
});
