/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger, NoopLogger, LogLevel } from './logger.js';
import type { Logger } from './logger.js';

describe('Logger', () => {
  describe('ConsoleLogger', () => {
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

    it('should log at INFO level by default', () => {
      const logger = new ConsoleLogger();

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledWith('[INFO] info message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] warn message');
      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] error message');
    });

    it('should log all levels when set to DEBUG', () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).toHaveBeenCalledOnce();
      expect(consoleSpy.info).toHaveBeenCalledOnce();
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });

    it('should only log errors when set to ERROR', () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });

    it('should log nothing when set to SILENT', () => {
      const logger = new ConsoleLogger(LogLevel.SILENT);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should include metadata when provided', () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);
      const metadata = { key: 'value', count: 42 };

      logger.info('test message', metadata);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[INFO] test message',
        metadata,
      );
    });

    it('should not include metadata argument when not provided', () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);

      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith('[INFO] test message');
    });
  });

  describe('NoopLogger', () => {
    it('should not call console methods', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const logger = new NoopLogger();

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('should implement the Logger interface', () => {
      const logger: Logger = new NoopLogger();

      // Should not throw
      logger.debug('test', { key: 'value' });
      logger.info('test', { key: 'value' });
      logger.warn('test', { key: 'value' });
      logger.error('test', { key: 'value' });
    });
  });

  describe('Logger interface', () => {
    it('should allow custom logger implementations', () => {
      const messages: Array<{
        level: string;
        message: string;
        metadata?: Record<string, unknown>;
      }> = [];

      const customLogger: Logger = {
        debug(message, metadata) {
          messages.push({ level: 'debug', message, metadata });
        },
        info(message, metadata) {
          messages.push({ level: 'info', message, metadata });
        },
        warn(message, metadata) {
          messages.push({ level: 'warn', message, metadata });
        },
        error(message, metadata) {
          messages.push({ level: 'error', message, metadata });
        },
      };

      customLogger.info('test message', { sessionId: 'abc-123' });
      customLogger.error('something failed', { code: 500 });

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        level: 'info',
        message: 'test message',
        metadata: { sessionId: 'abc-123' },
      });
      expect(messages[1]).toEqual({
        level: 'error',
        message: 'something failed',
        metadata: { code: 500 },
      });
    });
  });
});
