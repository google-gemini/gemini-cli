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
import type { LogEntry } from './logger.js';
import {
  Logger,
  MessageSenderType,
  encodeTagName,
  decodeTagName,
} from './logger.js';
import { Storage } from '../config/storage.js';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import type { Content } from '@google/genai';

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
    logger = new Logger(testSessionId, new Storage(process.cwd()));
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
      const newLogger = new Logger(
        currentSessionId,
        new Storage(process.cwd()),
      );
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
      const newLogger = new Logger('a-new-session', new Storage(process.cwd()));
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

      const newLogger = new Logger(testSessionId, new Storage(process.cwd()));
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

      const newLogger = new Logger(testSessionId, new Storage(process.cwd()));
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
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
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
      const logger1 = new Logger(
        concurrentSessionId,
        new Storage(process.cwd()),
      );
      await logger1.initialize();

      const logger2 = new Logger(
        concurrentSessionId,
        new Storage(process.cwd()),
      );
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
      const loggerSort = new Logger('session-1', new Storage(process.cwd()));
      await loggerSort.initialize();
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M0_ts100000');
      vi.advanceTimersByTime(1000);
      await loggerSort.logMessage(MessageSenderType.USER, 'S1M1_ts101000');
      vi.advanceTimersByTime(1000);
      // Switch to a different session to log
      const loggerSort2 = new Logger('session-2', new Storage(process.cwd()));
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

      const finalLogger = new Logger(
        'final-session',
        new Storage(process.cwd()),
      );
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
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
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

    it.each([
      {
        tag: 'test-tag',
        encodedTag: 'test-tag',
      },
      {
        tag: '你好世界',
        encodedTag: '%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C',
      },
      {
        tag: 'japanese-ひらがなひらがな形声',
        encodedTag:
          'japanese-%E3%81%B2%E3%82%89%E3%81%8C%E3%81%AA%E3%81%B2%E3%82%89%E3%81%8C%E3%81%AA%E5%BD%A2%E5%A3%B0',
      },
      {
        tag: '../../secret',
        encodedTag: '..%2F..%2Fsecret',
      },
    ])('should save a checkpoint', async ({ tag, encodedTag }) => {
      await logger.saveCheckpoint(conversation, tag);
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${encodedTag}.json`,
      );
      const fileContent = await fs.readFile(taggedFilePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual(conversation);
    });

    it('should not throw if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
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

    it.each([
      {
        tag: 'test-tag',
        encodedTag: 'test-tag',
      },
      {
        tag: '你好世界',
        encodedTag: '%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C',
      },
      {
        tag: 'japanese-ひらがなひらがな形声',
        encodedTag:
          'japanese-%E3%81%B2%E3%82%89%E3%81%8C%E3%81%AA%E3%81%B2%E3%82%89%E3%81%8C%E3%81%AA%E5%BD%A2%E5%A3%B0',
      },
      {
        tag: '../../secret',
        encodedTag: '..%2F..%2Fsecret',
      },
    ])('should load from a checkpoint', async ({ tag, encodedTag }) => {
      const taggedConversation = [
        ...conversation,
        { role: 'user', parts: [{ text: 'hello' }] },
      ];
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${encodedTag}.json`,
      );
      await fs.writeFile(
        taggedFilePath,
        JSON.stringify(taggedConversation, null, 2),
      );

      const loaded = await logger.loadCheckpoint(tag);
      expect(loaded).toEqual(taggedConversation);
      expect(encodeTagName(tag)).toBe(encodedTag);
      expect(decodeTagName(encodedTag)).toBe(tag);
    });

    it('should return an empty array if a tagged checkpoint file does not exist', async () => {
      const loaded = await logger.loadCheckpoint('nonexistent-tag');
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the checkpoint file does not exist', async () => {
      await fs.unlink(TEST_CHECKPOINT_FILE_PATH); // Ensure it's gone
      const loaded = await logger.loadCheckpoint('missing');
      expect(loaded).toEqual([]);
    });

    it('should return an empty array if the file contains invalid JSON', async () => {
      const tag = 'invalid-json-tag';
      const encodedTag = 'invalid-json-tag';
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${encodedTag}.json`,
      );
      await fs.writeFile(taggedFilePath, 'invalid json');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const loadedCheckpoint = await logger.loadCheckpoint(tag);
      expect(loadedCheckpoint).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read or parse checkpoint file'),
        expect.any(Error),
      );
    });

    it('should return an empty array if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
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

  describe('deleteCheckpoint', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Content to be deleted' }] },
    ];
    const tag = 'delete-me';
    const encodedTag = 'delete-me';
    let taggedFilePath: string;

    beforeEach(async () => {
      taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${encodedTag}.json`,
      );
      // Create a file to be deleted
      await fs.writeFile(taggedFilePath, JSON.stringify(conversation));
    });

    it('should delete the specified checkpoint file and return true', async () => {
      const result = await logger.deleteCheckpoint(tag);
      expect(result).toBe(true);

      // Verify the file is actually gone
      await expect(fs.access(taggedFilePath)).rejects.toThrow(/ENOENT/);
    });

    it('should delete both new and old checkpoint files if they exist', async () => {
      const oldTag = 'delete-me(old)';
      const oldStylePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${oldTag}.json`,
      );
      const newStylePath = logger['_checkpointPath'](oldTag);

      // Create both files
      await fs.writeFile(oldStylePath, '{}');
      await fs.writeFile(newStylePath, '{}');

      // Verify both files exist before deletion
      expect(existsSync(oldStylePath)).toBe(true);
      expect(existsSync(newStylePath)).toBe(true);

      const result = await logger.deleteCheckpoint(oldTag);
      expect(result).toBe(true);

      // Verify both are gone
      expect(existsSync(oldStylePath)).toBe(false);
      expect(existsSync(newStylePath)).toBe(false);
    });

    it('should return false if the checkpoint file does not exist', async () => {
      const result = await logger.deleteCheckpoint('non-existent-tag');
      expect(result).toBe(false);
    });

    it('should re-throw an error if file deletion fails for reasons other than not existing', async () => {
      // Simulate a different error (e.g., permission denied)
      vi.spyOn(fs, 'unlink').mockRejectedValueOnce(
        Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        }),
      );
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(logger.deleteCheckpoint(tag)).rejects.toThrow(
        'EACCES: permission denied',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to delete checkpoint file ${taggedFilePath}:`,
        expect.any(Error),
      );
    });

    it('should return false if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
      uninitializedLogger.close();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await uninitializedLogger.deleteCheckpoint(tag);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logger not initialized or checkpoint file path not set. Cannot delete checkpoint.',
      );
    });
  });

  describe('checkpointExists', () => {
    const tag = 'exists-test';
    const encodedTag = 'exists-test';
    let taggedFilePath: string;

    beforeEach(() => {
      taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${encodedTag}.json`,
      );
    });

    it('should return true if the checkpoint file exists', async () => {
      await fs.writeFile(taggedFilePath, '{}');
      const exists = await logger.checkpointExists(tag);
      expect(exists).toBe(true);
    });

    it('should return false if the checkpoint file does not exist', async () => {
      const exists = await logger.checkpointExists('non-existent-tag');
      expect(exists).toBe(false);
    });

    it('should throw an error if logger is not initialized', async () => {
      const uninitializedLogger = new Logger(
        testSessionId,
        new Storage(process.cwd()),
      );
      uninitializedLogger.close();

      await expect(uninitializedLogger.checkpointExists(tag)).rejects.toThrow(
        'Logger not initialized. Cannot check for checkpoint existence.',
      );
    });

    it('should re-throw an error if fs.access fails for reasons other than not existing', async () => {
      vi.spyOn(fs, 'access').mockRejectedValueOnce(
        Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        }),
      );
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(logger.checkpointExists(tag)).rejects.toThrow(
        'EACCES: permission denied',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to check checkpoint existence for path for tag "${tag}":`,
        expect.any(Error),
      );
    });
  });

  describe('Backward compatibility', () => {
    const conversation: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];
    it('should load from a checkpoint with a raw special character tag', async () => {
      const taggedConversation = [
        ...conversation,
        { role: 'user', parts: [{ text: 'hello' }] },
      ];
      const tag = 'special(char)';
      const taggedFilePath = path.join(
        TEST_GEMINI_DIR,
        `checkpoint-${tag}.json`,
      );
      await fs.writeFile(
        taggedFilePath,
        JSON.stringify(taggedConversation, null, 2),
      );

      const loaded = await logger.loadCheckpoint(tag);
      expect(loaded).toEqual(taggedConversation);
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
