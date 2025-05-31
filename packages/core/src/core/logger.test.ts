/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { Logger, MessageSenderType, LogEntry } from './logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const GEMINI_DIR = '.gemini';
const LOG_FILE_NAME = 'logs.json';
const TEST_LOG_FILE_PATH = path.join(process.cwd(), GEMINI_DIR, LOG_FILE_NAME);

async function cleanupLogFile() {
  try {
    await fs.unlink(TEST_LOG_FILE_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Other errors during unlink are ignored for cleanup purposes
    }
  }
  try {
    const geminiDirPath = path.join(process.cwd(), GEMINI_DIR);
    const dirContents = await fs.readdir(geminiDirPath);
    for (const file of dirContents) {
      if (file.startsWith(LOG_FILE_NAME + '.') && file.endsWith('.bak')) {
        try {
          await fs.unlink(path.join(geminiDirPath, file));
        } catch (_e) {
          /* ignore */
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      /* ignore if .gemini dir itself is missing */
    }
  }
}

async function readLogFile(): Promise<LogEntry[]> {
  try {
    const content = await fs.readFile(TEST_LOG_FILE_PATH, 'utf-8');
    return JSON.parse(content) as LogEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

describe('Logger', () => {
  let logger: Logger;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    await cleanupLogFile();
    logger = new Logger();
    // Initialize is usually called here, but some tests initialize their own instances.
    // For tests that use the global `logger`, it will be initialized here.
    await logger.initialize();
  });

  afterEach(async () => {
    logger.close();
    await cleanupLogFile();
    vi.useRealTimers();
    vi.resetAllMocks(); // Ensure mocks are reset for every test
  });

  afterAll(async () => {
    await cleanupLogFile();
  });

  describe('initialize', () => {
    it('should create .gemini directory and an empty log file if none exist', async () => {
      await cleanupLogFile();
      const geminiDirPath = path.join(process.cwd(), GEMINI_DIR);
      try {
        await fs.rm(geminiDirPath, { recursive: true, force: true });
      } catch (_e) {
        /* ignore */
      }

      const newLogger = new Logger();
      await newLogger.initialize();

      const dirExists = await fs
        .access(geminiDirPath)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
      const fileExists = await fs
        .access(TEST_LOG_FILE_PATH)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      newLogger.close();
    });

    it('should load existing logs and set correct messageId for the current session', async () => {
      const fixedTime = new Date('2025-01-01T10:00:00.000Z');
      vi.setSystemTime(fixedTime);
      const currentSessionId = Math.floor(fixedTime.getTime() / 1000);
      const existingLogs: LogEntry[] = [
        {
          sessionId: currentSessionId,
          messageId: 0,
          timestamp: new Date('2025-01-01T10:00:05.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'Msg1',
        },
        {
          sessionId: currentSessionId - 100,
          messageId: 5,
          timestamp: new Date('2025-01-01T09:00:00.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'OldMsg',
        },
        {
          sessionId: currentSessionId,
          messageId: 1,
          timestamp: new Date('2025-01-01T10:00:10.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'Msg2',
        },
      ];
      await fs.mkdir(path.join(process.cwd(), GEMINI_DIR), { recursive: true });
      await fs.writeFile(TEST_LOG_FILE_PATH, JSON.stringify(existingLogs));
      const newLogger = new Logger();
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(2);
      expect(newLogger['logs']).toEqual(existingLogs);
      newLogger.close();
    });

    it('should set messageId to 0 for a new session if log file exists but has no logs for current session', async () => {
      const fixedTime = new Date('2025-01-01T14:00:00.000Z');
      vi.setSystemTime(fixedTime);
      const existingLogs: LogEntry[] = [
        {
          sessionId: Math.floor(fixedTime.getTime() / 1000) - 500,
          messageId: 5,
          timestamp: new Date().toISOString(),
          type: MessageSenderType.USER,
          message: 'OldMsg',
        },
      ];
      await fs.mkdir(path.join(process.cwd(), GEMINI_DIR), { recursive: true });
      await fs.writeFile(TEST_LOG_FILE_PATH, JSON.stringify(existingLogs));
      const newLogger = new Logger();
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(0);
      newLogger.close();
    });

    it('should be idempotent', async () => {
      // logger is initialized in beforeEach
      await logger.logMessage(MessageSenderType.USER, 'test message');
      const initialMessageId = logger['messageId'];
      const initialLogCount = logger['logs'].length;
      await logger.initialize(); // Second call should not change state
      expect(logger['messageId']).toBe(initialMessageId);
      expect(logger['logs'].length).toBe(initialLogCount);
      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(1);
    });

    it('should handle invalid JSON in log file by backing it up and starting fresh', async () => {
      await fs.mkdir(path.join(process.cwd(), GEMINI_DIR), { recursive: true });
      await fs.writeFile(TEST_LOG_FILE_PATH, 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      const newLogger = new Logger();
      await newLogger.initialize();
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in log file'),
        expect.any(SyntaxError),
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(
        path.join(process.cwd(), GEMINI_DIR),
      );
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.invalid_json') && f.endsWith('.bak'),
        ),
      ).toBe(true);
      consoleDebugSpy.mockRestore();
      newLogger.close();
    });

    it('should handle non-array JSON in log file by backing it up and starting fresh', async () => {
      await fs.mkdir(path.join(process.cwd(), GEMINI_DIR), { recursive: true });
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify({ not: 'an array' }),
      );
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      const newLogger = new Logger();
      await newLogger.initialize();
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        `Log file at ${TEST_LOG_FILE_PATH} is not a valid JSON array. Starting with empty logs.`,
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(
        path.join(process.cwd(), GEMINI_DIR),
      );
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.malformed_array') &&
            f.endsWith('.bak'),
        ),
      ).toBe(true);
      consoleDebugSpy.mockRestore();
      newLogger.close();
    });
  });

  describe('logMessage', () => {
    it('should append a message to the log file and update in-memory logs', async () => {
      await logger.logMessage(MessageSenderType.USER, 'Hello, world!');
      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(1);
      expect(logsFromFile[0]).toMatchObject({
        sessionId: logger['sessionId'],
        messageId: 0,
        type: MessageSenderType.USER,
        message: 'Hello, world!',
        timestamp: new Date('2025-01-01T12:00:00.000Z').toISOString(),
      });
      expect(logger['logs'].length).toBe(1);
      expect(logger['logs'][0]).toEqual(logsFromFile[0]);
      expect(logger['messageId']).toBe(1);
    });

    it('should correctly increment messageId for subsequent messages in the same session', async () => {
      await logger.logMessage(MessageSenderType.USER, 'First');
      vi.advanceTimersByTime(1000);
      await logger.logMessage(MessageSenderType.USER, 'Second');
      const logs = await readLogFile();
      expect(logs.length).toBe(2);
      expect(logs[0].messageId).toBe(0);
      expect(logs[1].messageId).toBe(1);
      expect(logs[1].timestamp).not.toBe(logs[0].timestamp);
      expect(logger['messageId']).toBe(2);
    });

    it('should handle logger not initialized', async () => {
      const uninitializedLogger = new Logger();
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await uninitializedLogger.logMessage(MessageSenderType.USER, 'test');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Logger not initialized or session ID missing. Cannot log message.',
      );
      expect((await readLogFile()).length).toBe(0);
      consoleDebugSpy.mockRestore();
      uninitializedLogger.close();
    });

    it('should simulate concurrent writes from different logger instances to the same file', async () => {
      const logger1 = new Logger(); // logger1
      vi.setSystemTime(new Date('2025-01-01T13:00:00.000Z'));
      await logger1.initialize();
      const s1 = logger1['sessionId'];

      const logger2 = new Logger(); // logger2, will share same session if time is same
      vi.setSystemTime(new Date('2025-01-01T13:00:00.000Z'));
      await logger2.initialize();
      expect(logger2['sessionId']).toEqual(s1);

      // Log from logger1
      await logger1.logMessage(MessageSenderType.USER, 'L1M1'); // L1 internal msgId becomes 1, writes {s1, 0}
      vi.advanceTimersByTime(10);

      // Log from logger2. It reads file (sees {s1,0}), its internal msgId for s1 is 1.
      await logger2.logMessage(MessageSenderType.USER, 'L2M1'); // L2 internal msgId becomes 2, writes {s1, 1}
      vi.advanceTimersByTime(10);

      // Log from logger1. It reads file (sees {s1,0}, {s1,1}), its internal msgId for s1 is 2.
      await logger1.logMessage(MessageSenderType.USER, 'L1M2'); // L1 internal msgId becomes 3, writes {s1, 2}
      vi.advanceTimersByTime(10);

      // Log from logger2. It reads file (sees {s1,0}, {s1,1}, {s1,2}), its internal msgId for s1 is 3.
      await logger2.logMessage(MessageSenderType.USER, 'L2M2'); // L2 internal msgId becomes 4, writes {s1, 3}

      const logsFromFile = await readLogFile();
      expect(logsFromFile.length).toBe(4);
      const messageIdsInFile = logsFromFile
        .map((log) => log.messageId)
        .sort((a, b) => a - b);
      expect(messageIdsInFile).toEqual([0, 1, 2, 3]);

      const messagesInFile = logsFromFile
        .sort((a, b) => a.messageId - b.messageId)
        .map((l) => l.message);
      expect(messagesInFile).toEqual(['L1M1', 'L2M1', 'L1M2', 'L2M2']);

      // Check internal state (next messageId each logger would use for that session)
      expect(logger1['messageId']).toBe(3); // L1 wrote 0, then 2. Next is 3.
      expect(logger2['messageId']).toBe(4); // L2 wrote 1, then 3. Next is 4.

      logger1.close();
      logger2.close();
    });

    it('should not throw, not increment messageId, and log error if writing to file fails', async () => {
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockRejectedValueOnce(new Error('Disk full'));
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      const initialMessageId = logger['messageId'];
      const initialLogCount = logger['logs'].length;

      await logger.logMessage(MessageSenderType.USER, 'test fail write');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Error writing to log file:',
        expect.any(Error),
      );
      expect(logger['messageId']).toBe(initialMessageId); // Not incremented
      expect(logger['logs'].length).toBe(initialLogCount); // Log not added to in-memory cache

      writeFileSpy.mockRestore();
      consoleDebugSpy.mockRestore();
    });
  });

  describe('getPreviousUserMessages', () => {
    it('should retrieve user messages, sorted newest first by session, then timestamp, then messageId', async () => {
      const loggerSort = new Logger();
      vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
      await loggerSort.initialize();
      const s1 = loggerSort['sessionId']!;
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M0_ts100000'); // msgId 0
      vi.advanceTimersByTime(10);
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M1_ts100010'); // msgId 1
      loggerSort.close(); // Close to ensure next initialize starts a new session if time changed

      vi.setSystemTime(new Date('2025-01-01T11:00:00.000Z'));
      await loggerSort.initialize(); // Re-initialize for a new session
      const s2 = loggerSort['sessionId']!;
      expect(s2).not.toEqual(s1);
      await loggerSort.logMessage(MessageSenderType.USER, 'S2M0_ts110000'); // msgId 0 for s2
      vi.advanceTimersByTime(10);
      await loggerSort.logMessage(
        'model' as MessageSenderType,
        'S2_Model_ts110010',
      );
      vi.advanceTimersByTime(10);
      await loggerSort.logMessage(MessageSenderType.USER, 'S2M1_ts110020'); // msgId 1 for s2
      loggerSort.close();

      // To test the sorting thoroughly, especially the session part, we'll read the file
      // as if it was written by multiple sessions and then initialize a new logger to load them.
      const combinedLogs = await readLogFile();
      const finalLogger = new Logger();
      // Manually set its internal logs to simulate loading from a file with mixed sessions
      finalLogger['logs'] = combinedLogs;
      finalLogger['initialized'] = true; // Mark as initialized to allow getPreviousUserMessages to run

      const messages = await finalLogger.getPreviousUserMessages();
      expect(messages).toEqual([
        'S2M1_ts110020',
        'S2M0_ts110000',
        'S1M1_ts100010',
        'S1M0_ts100000',
      ]);
      finalLogger.close();
    });

    it('should return empty array if no user messages exist', async () => {
      await logger.logMessage('system' as MessageSenderType, 'System boot');
      const messages = await logger.getPreviousUserMessages();
      expect(messages).toEqual([]);
    });

    it('should return empty array if logger not initialized', async () => {
      const uninitializedLogger = new Logger();
      const messages = await uninitializedLogger.getPreviousUserMessages();
      expect(messages).toEqual([]);
      uninitializedLogger.close();
    });
  });

  describe('close', () => {
    it('should reset logger state', async () => {
      await logger.logMessage(MessageSenderType.USER, 'A message');
      logger.close();
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await logger.logMessage(MessageSenderType.USER, 'Another message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Logger not initialized or session ID missing. Cannot log message.',
      );
      const messages = await logger.getPreviousUserMessages();
      expect(messages).toEqual([]);
      expect(logger['initialized']).toBe(false);
      expect(logger['logFilePath']).toBeUndefined();
      expect(logger['logs']).toEqual([]);
      expect(logger['sessionId']).toBeUndefined();
      expect(logger['messageId']).toBe(0);
      consoleDebugSpy.mockRestore();
    });
  });
});
