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

import crypto from 'node:crypto';
import os from 'node:os';

const GEMINI_DIR_NAME = '.gemini';
const TMP_DIR_NAME = 'tmp';
const LOG_FILE_NAME = 'logs.json';
const CHECKPOINT_FILE_NAME = 'checkpoint.json';

const projectDir = process.cwd();
const hash = crypto.createHash('sha256').update(projectDir).digest('hex');
const TEST_GEMINI_DIR = path.join(
  os.homedir(),
  GEMINI_DIR_NAME,
  TMP_DIR_NAME,
  hash,
);

const TEST_LOG_FILE_PATH = path.join(TEST_GEMINI_DIR, LOG_FILE_NAME);
const TEST_CHECKPOINT_FILE_PATH = path.join(
  TEST_GEMINI_DIR,
  CHECKPOINT_FILE_NAME,
);

async function cleanupLogAndCheckpointFiles() {
  try {
    await fs.rm(TEST_GEMINI_DIR, { recursive: true, force: true });
  } catch (_error) {
    // Ignore errors, as the directory may not exist, which is fine.
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
    // Clean up before the test
    await cleanupLogAndCheckpointFiles();
    // Ensure the directory exists for the test
    await fs.mkdir(TEST_GEMINI_DIR, { recursive: true });
    logger = new Logger(testSessionId);
    await logger.initialize();
  });

  afterEach(async () => {
    if (logger) {
      logger.close();
    }
    // Clean up after the test
    await cleanupLogAndCheckpointFiles();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupLogAndCheckpointFiles();
  });

  describe('initialize', () => {
    it('should create .gemini directory and an empty log file if none exist', async () => {
      const dirExists = await fs
        .access(TEST_GEMINI_DIR)
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
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify(existingLogs, null, 2),
      );
      const newLogger = new Logger(currentSessionId);
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(2);
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
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify(existingLogs, null, 2),
      );
      const newLogger = new Logger('a-new-session');
      await newLogger.initialize();
      expect(newLogger['messageId']).toBe(0);
      newLogger.close();
    });

    it('should be idempotent', async () => {
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
      await fs.writeFile(TEST_LOG_FILE_PATH, 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const newLogger = new Logger(testSessionId);
      await newLogger.initialize();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in log file'),
        expect.any(SyntaxError),
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(TEST_GEMINI_DIR);
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.invalid_json') && f.endsWith('.bak'),
        ),
      ).toBe(true);
      newLogger.close();
    });

    it('should handle non-array JSON in log file by backing it up and starting fresh', async () => {
      await fs.writeFile(
        TEST_LOG_FILE_PATH,
        JSON.stringify({ not: 'an array' }),
      );
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const newLogger = new Logger(testSessionId);
      await newLogger.initialize();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        `Log file at ${TEST_LOG_FILE_PATH} is not a valid JSON array. Starting with empty logs.`,
      );
      const logContent = await readLogFile();
      expect(logContent).toEqual([]);
      const dirContents = await fs.readdir(TEST_GEMINI_DIR);
      expect(
        dirContents.some(
          (f) =>
            f.startsWith(LOG_FILE_NAME + '.malformed_array') &&
            f.endsWith('.bak'),
        ),
      ).toBe(true);
      newLogger.close();
    });
  });

  describe('logMessage', () => {
    it('should append a message to the log file and update in-memory logs', async () => {
      await logger.logMessage(MessageSenderType.USER, 'Hello, world!');
      const logsFromFile = await readLogFile();
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
      const logs = await readLogFile();
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
      expect((await readLogFile()).length).toBe(0);
      uninitializedLogger.close();
    });

    it('should simulate concurrent writes from different logger instances to the same file', async () => {
      const concurrentSessionId = 'concurrent-session';
      const logger1 = new Logger(concurrentSessionId);
      await logger1.initialize();

      const logger2 = new Logger(concurrentSessionId);
      await logger2.initialize();
      expect(logger2['sessionId']).toEqual(logger1['sessionId']);

      await logger1.logMessage(MessageSenderType.USER, 'L1M1');
      vi.advanceTimersByTime(10);
      await logger2.logMessage(MessageSenderType.USER, 'L2M1');
      vi.advanceTimersByTime(10);
      await logger1.logMessage(MessageSenderType.USER, 'L1M2');
      vi.advanceTimersByTime(10);
      await logger2.logMessage(MessageSenderType.USER, 'L2M2');

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

  describe('getPreviousUserMessages', () => {
    it('should retrieve all user messages from logs, sorted newest first', async () => {
      const loggerSort = new Logger('session-1');
      await loggerSort.initialize();
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M0_ts100000');
      vi.advanceTimersByTime(1000);
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M1_ts101000');
      vi.advanceTimersByTime(1000);
      // Switch to a different session to log
      const loggerSort2 = new Logger('session-2');
      await loggerSort2.initialize();
      await loggerSort2.logMessage(MessageSenderType.USER, 'S2M0_ts102000');
      vi.advanceTimersByTime(1000);
      await loggerSort2.logMessage(
        'model' as MessageSenderType,
        'S2_Model_ts103000',
      );
      vi.advanceTimersByTime(1000);
      await loggerSort2.logMessage(MessageSenderType.USER, 'S2M1_ts104000');
      loggerSort.close();
      loggerSort2.close();

      const finalLogger = new Logger('final-session');
      await finalLogger.initialize();

      const messages = await finalLogger.getPreviousUserMessages();
      expect(messages).toEqual([
        'S2M1_ts104000',
        'S2M0_ts102000',
        'S1M1_ts101000',
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
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const messages = await uninitializedLogger.getPreviousUserMessages();
      expect(messages).toEqual([]);
      uninitializedLogger.close();
    });
  });

  describe('saveCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    it('should save a checkpoint to a tagged file when a tag is provided', async () => {
      const tag = 'my-test-tag';
      await logger.saveCheckpoint(conversation, tag);
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      const fileContent = await fs.readFile(taggedFilePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(conversation);
    });

    it('should not throw if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        uninitializedLogger.saveCheckpoint(conversation, 'tag'),
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
      await fs.writeFile(
        TEST_CHECKPOINT_FILE_PATH,
        JSON.stringify(conversation, null, 2),
      );
    });

    it('should load from a tagged checkpoint file when a tag is provided', async () => {
      const tag = 'my-load-tag';
      const taggedConversation = [
        ...conversation,
        { role: 'user', parts: [{ text: 'Another message' }] },
      ];
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `${CHECKPOINT_FILE_NAME.replace('.json', '')}-${tag}.json`,
      );
      await fs.writeFile(
        taggedFilePath,
        JSON.stringify(taggedConversation, null, 2),
      );

      const loaded = await logger.loadCheckpoint(tag);
      expect(loaded).toEqual(taggedConversation);
    });

    it('should return an empty array if a tagged checkpoint file does not exist', async () => {
      const loaded = await logger.loadCheckpoint('non-existent-tag');
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the checkpoint file does not exist', async () => {
      await fs.unlink(TEST_CHECKPOINT_FILE_PATH); // Ensure it's gone
      const loaded = await logger.loadCheckpoint('missing');
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the file contains invalid JSON', async () => {
      await fs.writeFile(TEST_CHECKPOINT_FILE_PATH, 'invalid json');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await logger.loadCheckpoint('missing');
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read or parse checkpoint file'),
        expect.any(Error),
      );
    });

    it('should return an empty array if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(testSessionId);
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await uninitializedLogger.loadCheckpoint('tag');
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
