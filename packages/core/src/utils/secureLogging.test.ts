/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  redactSecrets,
  redactEnvironmentSecrets,
  SecureLogger,
  createSecureLogger,
} from './secureLogging.js';

describe('Secure Logging', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('redactSecrets', () => {
    it('should redact API keys by key name', () => {
      const data = {
        apiKey: 'secret-api-key-12345',
        API_KEY: 'another-secret-key',
        gemini_api_key: 'gemini-secret-key',
        normalData: 'this is fine',
      };

      const result = redactSecrets(data) as Record<string, unknown>;

      expect(result).toEqual({
        apiKey: '[REDACTED]',
        API_KEY: '[REDACTED]',
        gemini_api_key: '[REDACTED]',
        normalData: 'this is fine',
      });
    });

    it('should redact tokens and secrets', () => {
      const data = {
        token: 'bearer-token-12345',
        secret: 'super-secret-value',
        password: 'my-password',
        normalField: 'normal-value',
      };

      const result = redactSecrets(data);

      expect(result).toEqual({
        token: '[REDACTED]',
        secret: '[REDACTED]',
        password: '[REDACTED]',
        normalField: 'normal-value',
      });
    });

    it('should redact suspicious values regardless of key name', () => {
      const data = {
        config: 'sk-1234567890abcdefghijklmnopqrstuvwxyz', // OpenAI-style key
        setting: 'AIzaSyDVcJ7kGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Google AI key
        normal: 'short',
        longHex: 'abcdef1234567890abcdef1234567890abcdef12', // Long hex
      };

      const result = redactSecrets(data) as Record<string, unknown>;

      expect(result.config).toBe('[REDACTED]');
      expect(result.setting).toBe('[REDACTED]');
      expect(result.normal).toBe('short');
      expect(result.longHex).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John',
          credentials: {
            apiKey: 'secret-key',
            token: 'bearer-token',
          },
        },
        config: {
          database: {
            password: 'db-password',
            host: 'localhost',
          },
        },
      };

      const result = redactSecrets(data);

      expect(result).toEqual({
        user: {
          name: 'John',
          credentials: {
            apiKey: '[REDACTED]',
            token: '[REDACTED]',
          },
        },
        config: {
          database: {
            password: '[REDACTED]',
            host: 'localhost',
          },
        },
      });
    });

    it('should handle arrays', () => {
      const data = {
        items: [
          { apiKey: 'secret1', name: 'item1' },
          { apiKey: 'secret2', name: 'item2' },
        ],
        tokens: ['token1', 'token2'],
      };

      const result = redactSecrets(data);

      expect(result).toEqual({
        items: [
          { apiKey: '[REDACTED]', name: 'item1' },
          { apiKey: '[REDACTED]', name: 'item2' },
        ],
        tokens: ['token1', 'token2'], // Short strings not redacted by pattern
      });
    });

    it('should handle null and undefined values', () => {
      const data = {
        apiKey: null,
        token: undefined,
        password: '',
        normalField: 'value',
      };

      const result = redactSecrets(data);

      expect(result).toEqual({
        apiKey: null,
        token: undefined,
        password: '[REDACTED]',
        normalField: 'value',
      });
    });

    it('should prevent infinite recursion', () => {
      const data: Record<string, unknown> = { name: 'test' };
      data.self = data; // Circular reference

      const result = redactSecrets(data) as Record<string, unknown>;

      expect(result.name).toBe('test');
      expect(typeof result.self).toBe('object');
    });

    it('should handle primitives', () => {
      expect(redactSecrets('normal string')).toBe('normal string');
      expect(redactSecrets('sk-1234567890abcdefghijklmnopqrstuvwxyz')).toBe(
        '[REDACTED]',
      );
      expect(redactSecrets(123)).toBe(123);
      expect(redactSecrets(true)).toBe(true);
      expect(redactSecrets(null)).toBe(null);
      expect(redactSecrets(undefined)).toBe(undefined);
    });
  });

  describe('redactEnvironmentSecrets', () => {
    it('should redact environment variables with sensitive names', () => {
      const env = {
        HOME: '/home/user',
        PATH: '/usr/bin:/bin',
        GEMINI_API_KEY: 'secret-key-123',
        GOOGLE_API_KEY: 'google-secret',
        DATABASE_PASSWORD: 'db-pass',
        API_TOKEN: 'token-123',
      };

      const result = redactEnvironmentSecrets(env);

      expect(result).toEqual({
        HOME: '/home/user',
        PATH: '/usr/bin:/bin',
        GEMINI_API_KEY: '[REDACTED]',
        GOOGLE_API_KEY: '[REDACTED]',
        DATABASE_PASSWORD: '[REDACTED]',
        API_TOKEN: '[REDACTED]',
      });
    });

    it('should preserve undefined values', () => {
      const env = {
        GEMINI_API_KEY: undefined,
        NORMAL_VAR: 'value',
      };

      const result = redactEnvironmentSecrets(env);

      expect(result).toEqual({
        GEMINI_API_KEY: undefined,
        NORMAL_VAR: 'value',
      });
    });

    it('should redact suspicious values even with normal key names', () => {
      const env = {
        CONFIG: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
        SETTING: 'AIzaSyDVcJ7kGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        NORMAL: 'normal-value',
      };

      const result = redactEnvironmentSecrets(env);

      expect(result.CONFIG).toBe('[REDACTED]');
      expect(result.SETTING).toBe('[REDACTED]');
      expect(result.NORMAL).toBe('normal-value');
    });
  });

  describe('SecureLogger', () => {
    it('should not log debug messages when debug is disabled', () => {
      const logger = new SecureLogger(false);
      logger.debug('test message', { apiKey: 'secret' });

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug is enabled', () => {
      const logger = new SecureLogger(true);
      logger.debug('test message');

      expect(consoleSpy.debug).toHaveBeenCalledWith('[DEBUG]', 'test message');
    });

    it('should redact secrets in debug logs', () => {
      const logger = new SecureLogger(true);
      const data = { apiKey: 'secret-key', normalData: 'value' };

      logger.debug('Config loaded', data);

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        '[DEBUG]',
        'Config loaded',
        { apiKey: '[REDACTED]', normalData: 'value' },
      );
    });

    it('should redact secrets in error logs', () => {
      const logger = new SecureLogger(false);
      const data = { password: 'secret-password', error: 'Something failed' };

      logger.error('An error occurred', data);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[ERROR]',
        'An error occurred',
        { password: '[REDACTED]', error: 'Something failed' },
      );
    });

    it('should redact sensitive messages', () => {
      const logger = new SecureLogger(true);
      const sensitiveMessage =
        'API key: sk-1234567890abcdefghijklmnopqrstuvwxyz';

      logger.info(sensitiveMessage);

      expect(consoleSpy.info).toHaveBeenCalledWith('[INFO]', '[REDACTED]');
    });

    it('should handle logging without data parameter', () => {
      const logger = new SecureLogger(true);

      logger.info('Simple message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(consoleSpy.info).toHaveBeenCalledWith('[INFO]', 'Simple message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN]', 'Warning message');
      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR]', 'Error message');
    });
  });

  describe('createSecureLogger', () => {
    it('should create a SecureLogger instance', () => {
      const logger = createSecureLogger(true);
      expect(logger).toBeInstanceOf(SecureLogger);
    });

    it('should respect debug flag', () => {
      const debugLogger = createSecureLogger(true);
      const nonDebugLogger = createSecureLogger(false);

      debugLogger.debug('test');
      nonDebugLogger.debug('test');

      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should handle redaction errors gracefully', () => {
      // Create an object that will cause JSON serialization issues
      const problematicData: Record<string, unknown> = {};
      problematicData.circular = problematicData;

      // Add a property that will throw during access
      Object.defineProperty(problematicData, 'throwOnAccess', {
        get() {
          throw new Error('Access denied');
        },
        enumerable: true,
      });

      // Should not throw, should return safe fallback
      const result = redactSecrets(problematicData);
      expect(typeof result).toBe('object');
    });

    it('should handle environment redaction errors gracefully', () => {
      const mockConsoleWarn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Force an error by passing invalid data
      const result = redactEnvironmentSecrets(
        null as unknown as Record<string, string | undefined>,
      );

      expect(result).toEqual({ '[REDACTION_FAILED]': '[REDACTION_FAILED]' });
      expect(mockConsoleWarn).toHaveBeenCalled();

      mockConsoleWarn.mockRestore();
    });
  });

  describe('Pattern matching', () => {
    it('should detect OpenAI API keys', () => {
      const data = { key: 'sk-1234567890abcdefghijklmnopqrstuvwxyz' };
      const result = redactSecrets(data) as Record<string, unknown>;
      expect(result.key).toBe('[REDACTED]');
    });

    it('should detect Google API keys', () => {
      const data = { key: 'AIzaSyDVcJ7kGGGGGGGGGGGGGGGGGGGGGGGGGGG' };
      const result = redactSecrets(data) as Record<string, unknown>;
      expect(result.key).toBe('[REDACTED]');
    });

    it('should detect Google OAuth tokens', () => {
      const data = { token: 'ya29.1234567890abcdefghijklmnopqrstuvwxyz' };
      const result = redactSecrets(data) as Record<string, unknown>;
      expect(result.token).toBe('[REDACTED]');
    });

    it('should detect long base64-like strings', () => {
      const data = {
        encoded: 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSBsb25nIGJhc2U2NCBzdHJpbmc=',
      };
      const result = redactSecrets(data) as Record<string, unknown>;
      expect(result.encoded).toBe('[REDACTED]');
    });

    it('should detect long hex strings', () => {
      const data = { hex: 'abcdef1234567890abcdef1234567890abcdef1234567890' };
      const result = redactSecrets(data) as Record<string, unknown>;
      expect(result.hex).toBe('[REDACTED]');
    });

    it('should not redact short strings', () => {
      const data = {
        short: 'abc123',
        normal: 'Hello World',
        uuid: '123e4567-e89b-12d3-a456-426614174000', // UUIDs are OK
      };
      const result = redactSecrets(data);
      expect(result).toEqual(data);
    });
  });
});
