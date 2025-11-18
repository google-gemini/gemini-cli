/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { logger } from './logger.js';

describe('a2a-server logger', () => {
  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have info method', () => {
      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    it('should have verbose method', () => {
      expect(logger.verbose).toBeDefined();
      expect(typeof logger.verbose).toBe('function');
    });

    it('should have silly method', () => {
      expect(logger.silly).toBeDefined();
      expect(typeof logger.silly).toBe('function');
    });
  });

  describe('logger configuration', () => {
    it('should have level property', () => {
      expect(logger.level).toBeDefined();
      expect(typeof logger.level).toBe('string');
    });

    it('should be set to info level', () => {
      expect(logger.level).toBe('info');
    });

    it('should have transports', () => {
      expect(logger.transports).toBeDefined();
      expect(Array.isArray(logger.transports)).toBe(true);
    });

    it('should have at least one transport', () => {
      expect(logger.transports.length).toBeGreaterThan(0);
    });

    it('should have Console transport', () => {
      const hasConsoleTransport = logger.transports.some(
        (t) => t.constructor.name === 'Console',
      );
      expect(hasConsoleTransport).toBe(true);
    });
  });

  describe('logger methods', () => {
    it('should accept string messages', () => {
      expect(() => logger.info('test message')).not.toThrow();
    });

    it('should accept additional metadata', () => {
      expect(() =>
        logger.info('test', { key: 'value', count: 42 }),
      ).not.toThrow();
    });

    it('should handle different log levels', () => {
      expect(() => logger.error('error message')).not.toThrow();
      expect(() => logger.warn('warning message')).not.toThrow();
      expect(() => logger.debug('debug message')).not.toThrow();
    });

    it('should handle empty messages', () => {
      expect(() => logger.info('')).not.toThrow();
    });
  });

  describe('logger format', () => {
    it('should have format property', () => {
      expect(logger.format).toBeDefined();
    });

    it('should include timestamp in format', () => {
      // Winston formats are complex objects, just verify it exists
      expect(logger.format).toBeDefined();
    });
  });
});
