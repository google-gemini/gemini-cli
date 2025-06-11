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
import { Content } from '@google/genai';

const GEMINI_DIR = '.gemini';
const LOG_FILE_NAME_PREFIX = 'logs';
const CHECKPOINT_FILE_NAME = 'checkpoint.json';
const TEST_LOG_FILE_PATH = path.join(
  process.cwd(),
  GEMINI_DIR,
  LOG_FILE_NAME_PREFIX,
);
const TEST_CHECKPOINT_FILE_PATH = path.join(
  process.cwd(),
  GEMINI_DIR,
  CHECKPOINT_FILE_NAME,
);

async function cleanupLogFiles() {
  try {
    const geminiDirPath = path.join(process.cwd(), GEMINI_DIR);
    const dirContents = await fs.readdir(geminiDirPath);
    for (const file of dirContents) {
      if (
        file.startsWith(LOG_FILE_NAME_PREFIX) ||
        file.startsWith(CHECKPOINT_FILE_NAME)
      ) {
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

async function readLogFile(sessionId: string): Promise<LogEntry[]> {
  try {
    const content = await fs.readFile(
      `${TEST_LOG_FILE_PATH}-${sessionId}.json`,
      'utf-8',
    );
    return JSON.parse(content) as LogEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

vi.mock('../utils/session.js', () => ({
  sessionId: 'test-session-id',
}));

describe('Logger', () => {
  let logger: Logger;
  const testSessionId = 'test-session-id';

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    await cleanupLogFiles();
    logger = new Logger(testSessionId);
    await logger.initialize();
  });

  afterEach(async () => {
    logger.close();
    await cleanupLogFiles();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupLogFiles();
  });

  describe('initialize', () => {
    it('should create .gemini directory and an empty log file if none exist', async () => {
      await cleanupLogFiles();
      const geminiDirPath = path.join(process.cwd(), GEMINI_DIR);
      try {
        await fs.rm(geminiDirPath, { recursive: true, force: true });
      } catch (_e) {
        /* ignore */
      }

      const newLogger = new Logger(testSessionId);
      await newLogger.initialize();
      const dirExists = await fs
        .access(geminiDirPath)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
      const fileExists = await fs
        .access(path.join('', newLogger.getLogFilePath() ?? ''))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
      const logContent = await readLogFile(testSessionId);
      expect(logContent).toEqual([]);
      newLogger.close();
    });

    it('should load existing logs and set correct messageId for the current session', async () => {
      const currentSessionId = 'session-123';
      const anotherSessionId = 'session-456';
      const existingLogs: LogEntry[] = [
        {
          sessionId: currentSessionId,
          messageId: 0,
          timestamp: new Date('2025-01-01T10:00:05.000Z').toISOString(),
          type: MessageSenderType.USER,
          message: 'Msg1',
        },
        {
          sessionId: anotherSessionId,
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
      await fs.writeFile(
        `${TEST_LOG_FILE_PATH}-${currentSessionId}.json`,
        JSON.stringify(existingLogs),
      );
      const newLogger = new Logger(currentSessionId);
      await newLogger.initialize();

      const messageCount = existingLogs.filter(
        (log) => log.sessionId === currentSessionId,
      ).length;
      expect(newLogger['messageId']).toBe(messageCount);
      expect(newLogger['logs']).toEqual(existingLogs);
      newLogger.close();
    });

    it('should set messageId to 0 for a new session if log file exists but has no logs for current session', async () => {
      const existingLogs: LogEntry[] = [
        {
          sessionId: 'some-other-session',
          messageId: 5,
          timestamp: new Date().toISOString(),
          type: MessageSenderType.USER,
          message: 'OldMsg',
        },
      ];
      await fs.mkdir(path.join(process.cwd(), GEMINI_DIR), { recursive: true });
      await fs.writeFile(
        `${TEST_LOG_FILE_PATH}-some-other-session.json`,
        JSON.stringify(existingLogs),
      );
      const newLogger = new Logger('a-new-session');
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
      const logsFromFile = await readLogFile(testSessionId);
      expect(logsFromFile.length).toBe(1);
    });

    it('should handle invalid JSON in log file by backing it up and starting fresh', async () => {
      const logFilePath = `${TEST_LOG_FILE_PATH}-${testSessionId}.json`;
      await fs.mkdir(path.dirname(logFilePath), { recursive: true });
      await fs.writeFile(logFilePath, 'invalid json');

      const newLogger = new Logger(testSessionId);
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await newLogger.initialize();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in log file'),
        expect.any(SyntaxError),
      );

      expect(newLogger['logs']).toEqual([]);

      const dirContents = await fs.readdir(
        path.join(process.cwd(), GEMINI_DIR),
      );
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(`${path.basename(logFilePath)}.invalid_json`) &&
            f.endsWith('.bak'),
        ),
      ).toBe(true);

      newLogger.close();
      consoleDebugSpy.mockRestore();
    });

    it('should handle non-array JSON in log file by backing it up and starting fresh', async () => {
      const logFilePath = `${TEST_LOG_FILE_PATH}-${testSessionId}.json`;
      await fs.mkdir(path.dirname(logFilePath), { recursive: true });
      await fs.writeFile(logFilePath, JSON.stringify({ not: 'an array' }));

      const newLogger = new Logger(testSessionId);
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await newLogger.initialize();
      await fs.writeFile(logFilePath, JSON.stringify({ not: 'an array' }));
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        `Log file at ${logFilePath} is not a valid JSON array. Starting with empty logs.`,
      );
      expect(newLogger['logs']).toEqual([]);

      const logContent = await fs.readFile(logFilePath, 'utf-8');
      expect(JSON.parse(logContent)).toEqual({ not: 'an array' });

      const dirContents = await fs.readdir(
        path.join(process.cwd(), GEMINI_DIR),
      );
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(`${path.basename(logFilePath)}.malformed_array`) &&
            f.endsWith('.bak'),
        ),
      ).toBe(true);

      newLogger.close();
      consoleDebugSpy.mockRestore();
    });
  });

  describe('logMessage', () => {
    it('should append a message to the log file and update in-memory logs', async () => {
      await logger.logMessage(MessageSenderType.USER, 'Hello, world!');
      const logsFromFile = await readLogFile(testSessionId);
      expect(logsFromFile.length).toBe(1);
      expect(logsFromFile[0]).toMatchObject({
        sessionId: testSessionId,
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
      const logs = await readLogFile(testSessionId);
      expect(logs.length).toBe(2);
      expect(logs[0].messageId).toBe(0);
      expect(logs[1].messageId).toBe(1);
      expect(logs[1].timestamp).not.toBe(logs[0].timestamp);
      expect(logger['messageId']).toBe(2);
    });

    it('should handle logger not initialized', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close(); // Ensure it's treated as uninitialized
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      await uninitializedLogger.logMessage(MessageSenderType.USER, 'test');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Logger not initialized or session ID missing. Cannot log message.',
      );
      expect((await readLogFile(testSessionId)).length).toBe(0);
      uninitializedLogger.close();
    });

    it('should simulate concurrent writes from different logger instances to the same file', async () => {
      const concurrentSessionId = 'concurrent-session';
      const logger1 = new Logger(concurrentSessionId);
      await logger1.initialize();

      const logger2 = new Logger(concurrentSessionId);
      await logger2.initialize();
      expect(logger2['sessionId']).toEqual(logger1['sessionId']);

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

      const logsFromFile = await readLogFile(concurrentSessionId);
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
      expect(logger1['messageId']).toBe(3);
      expect(logger2['messageId']).toBe(4);

      logger1.close();
      logger2.close();
    });

    it('should not throw, not increment messageId, and log error if writing to file fails', async () => {
      vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Disk full'));
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
    });
  });

  describe('saveCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    it('should save a checkpoint to the default file when no tag is provided', async () => {
      await logger.saveCheckpoint(conversation);
      const fileContent = await fs.readFile(TEST_CHECKPOINT_FILE_PATH, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(conversation);
    });

    it('should save a checkpoint to a tagged file when a tag is provided', async () => {
      const tag = 'my-test-tag';
      await logger.saveCheckpoint(conversation, tag);
      const taggedFilePath = path.join(
        process.cwd(),
        GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      const fileContent = await fs.readFile(taggedFilePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(conversation);
      await fs.unlink(taggedFilePath);
    });

    it('should not throw if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        uninitializedLogger.saveCheckpoint(conversation),
      ).resolves.not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logger not initialized or checkpoint file path not set. Cannot save a checkpoint.',
      );
    });
  });

  describe('loadCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    beforeEach(async () => {
      // Create a default checkpoint for some tests
      await fs.writeFile(
        TEST_CHECKPOINT_FILE_PATH,
        JSON.stringify(conversation),
      );
    });

    it('should load from the default checkpoint file when no tag is provided', async () => {
      const loaded = await logger.loadCheckpoint();
      expect(loaded).toEqual(conversation);
    });

    it('should load from a tagged checkpoint file when a tag is provided', async () => {
      const tag = 'my-load-tag';
      const taggedConversation = [
        ...conversation,
        { role: 'user', parts: [{ text: 'Another message' }] },
      ];
      const taggedFilePath = path.join(
        process.cwd(),
        GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      await fs.writeFile(taggedFilePath, JSON.stringify(taggedConversation));

      const loaded = await logger.loadCheckpoint(tag);
      expect(loaded).toEqual(taggedConversation);

      // cleanup
      await fs.unlink(taggedFilePath);
    });

    it('should return an empty array if a tagged checkpoint file does not exist', async () => {
      const loaded = await logger.loadCheckpoint('non-existent-tag');
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the default checkpoint file does not exist', async () => {
      await fs.unlink(TEST_CHECKPOINT_FILE_PATH); // Ensure it's gone
      const loaded = await logger.loadCheckpoint();
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the file contains invalid JSON', async () => {
      await fs.writeFile(TEST_CHECKPOINT_FILE_PATH, 'invalid json');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await logger.loadCheckpoint();
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read or parse checkpoint file'),
        expect.any(SyntaxError),
      );
    });

    it('should return an empty array if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await uninitializedLogger.loadCheckpoint();
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logger not initialized or checkpoint file path not set. Cannot load checkpoint.',
      );
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
    });
  });
});
