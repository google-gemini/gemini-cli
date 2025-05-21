/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, MessageSenderType } from './logger.js';

// Mocks
const mockDb = {
  exec: vi.fn((_sql, callback) => callback?.(null)),
  all: vi.fn((_sql, _params, callback) => callback?.(null, [])),
  run: vi.fn((_sql, _params, callback) => callback?.(null)),
  close: vi.fn((callback) => callback?.(null)),
};

vi.mock('sqlite3', () => ({
  Database: vi.fn((_dbPath, _options, callback) => {
    process.nextTick(() => callback?.(null));
    return mockDb;
  }),
  default: {
    Database: vi.fn((_dbPath, _options, callback) => {
      process.nextTick(() => callback?.(null));
      return mockDb;
    }),
  },
}));

describe('Logger', () => {
  let logger: Logger;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Get a new instance for each test to ensure isolation,
    logger = new Logger();
    // We need to wait for the async initialize to complete
    await logger.initialize().catch((err) => {
      console.error('Error initializing logger:', err);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    logger.close(); // Close the database connection after each test
  });

  describe('initialize', () => {
    it('should execute create tables if not exists', async () => {
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringMatching(/CREATE TABLE IF NOT EXISTS messages/),
        expect.any(Function),
      );
    });

    it('should be idempotent', async () => {
      mockDb.exec.mockClear();

      await logger.initialize(); // Second call

      expect(mockDb.exec).not.toHaveBeenCalled();
    });
  });

  describe('logMessage', () => {
    it('should insert a message into the database', async () => {
      const type = MessageSenderType.USER;
      const message = 'Hello, world!';
      await logger.logMessage(type, message);
      expect(mockDb.run).toHaveBeenCalledWith(
        "INSERT INTO messages (session_id, message_id, type, message, timestamp) VALUES (?, ?, ?, ?, datetime('now'))",
        [expect.any(Number), 0, type, message], // sessionId, messageId, type, message
        expect.any(Function),
      );
    });

    it('should increment messageId for subsequent messages', async () => {
      await logger.logMessage(MessageSenderType.USER, 'First message');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(Number), 0, MessageSenderType.USER, 'First message'],
        expect.any(Function),
      );
      await logger.logMessage(MessageSenderType.USER, 'Second message');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(Number), 1, MessageSenderType.USER, 'Second message'], // messageId is now 1
        expect.any(Function),
      );
    });

    it('should handle database not initialized', async () => {
      const uninitializedLogger = new Logger();
      // uninitializedLogger.initialize() is not called
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await uninitializedLogger.logMessage(MessageSenderType.USER, 'test');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Database not initialized.');
      expect(mockDb.run).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle error during db.run', async () => {
      const error = new Error('db.run failed');
      mockDb.run.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_sql: any, _params: any, callback: any) => callback?.(error),
      );

      await expect(
        logger.logMessage(MessageSenderType.USER, 'test'),
      ).rejects.toThrow('db.run failed');
    });
  });

  describe('getPreviousUserMessages', () => {
    it('should query the database for messages', async () => {
      mockDb.all.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_sql: any, params: any, callback: any) =>
          callback?.(null, [{ message: 'msg1' }, { message: 'msg2' }]),
      );

      const messages = await logger.getPreviousUserMessages();

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT message FROM messages/),
        [],
        expect.any(Function),
      );
      expect(messages).toEqual(['msg1', 'msg2']);
    });

    it('should handle database not initialized', async () => {
      const uninitializedLogger = new Logger();
      // uninitializedLogger.initialize() is not called
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const messages = await uninitializedLogger.getPreviousUserMessages();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Database not initialized.');
      expect(messages).toEqual([]);
      expect(mockDb.all).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle error during db.all', async () => {
      const error = new Error('db.all failed');
      mockDb.all.mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_sql: any, _params: any, callback: any) => callback?.(error, []),
      );

      await expect(logger.getPreviousUserMessages()).rejects.toThrow(
        'db.all failed',
      );
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      logger.close();
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should handle database not initialized', () => {
      const uninitializedLogger = new Logger();
      // uninitializedLogger.initialize() is not called
      uninitializedLogger.close();
      expect(() => uninitializedLogger.close()).not.toThrow();
    });

    it('should handle error during db.close', () => {
      const error = new Error('db.close failed');
      mockDb.close.mockImplementationOnce((callback: (error: Error) => void) =>
        callback?.(error),
      );
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      logger.close();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error closing database:',
        error.message,
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
