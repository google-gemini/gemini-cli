/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RagLogger } from './ragLogger.js';
import { debugLogger } from './debugLogger.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('./debugLogger.js', () => ({
  debugLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('RagLogger', () => {
  let logger: RagLogger;

  beforeEach(() => {
    logger = new RagLogger();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should create the logs directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      logger.initialize('/test/logs');

      expect(fs.existsSync).toHaveBeenCalledWith('/test/logs');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/logs', {
        recursive: true,
        mode: 0o700,
      });
    });

    it('should not create the logs directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      logger.initialize('/test/logs');

      expect(fs.existsSync).toHaveBeenCalledWith('/test/logs');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should log an error to debugLogger if directory creation fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const error = new Error('mkdir failed');
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw error;
      });

      logger.initialize('/test/logs');

      expect(debugLogger.error).toHaveBeenCalledWith(
        'Failed to create directory for rag-trace.log',
        error,
      );
    });
  });

  describe('log', () => {
    it('should warn if called before initialization', () => {
      logger.log({ sessionId: '123', ragStatus: 'SUCCESS', snippets: [] });

      expect(debugLogger.warn).toHaveBeenCalledWith(
        'RagLogger was called before being initialized.',
      );
      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    it('should append log entry to the file with correct permissions', () => {
      logger.initialize('/test/logs');

      const entry = {
        sessionId: 'session-1',
        ragStatus: 'SUCCESS',
        snippets: [{ content: 'test snippet', relevanceScore: 0.9 }],
      };

      logger.log(entry);

      const expectedFullEntry = {
        timestamp: '2026-05-13T12:00:00.000Z',
        ...entry,
      };

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        path.join('/test/logs', 'rag-trace.log'),
        JSON.stringify(expectedFullEntry) + '\n',
        { mode: 0o600, encoding: 'utf8' },
      );
    });

    it('should log an error to debugLogger if appending to file fails', () => {
      logger.initialize('/test/logs');

      const error = new Error('append failed');
      vi.mocked(fs.appendFileSync).mockImplementation(() => {
        throw error;
      });

      logger.log({ sessionId: '123', ragStatus: 'SUCCESS', snippets: [] });

      expect(debugLogger.error).toHaveBeenCalledWith(
        `Failed to write to ${path.join('/test/logs', 'rag-trace.log')}`,
        error,
      );
    });
  });
});
