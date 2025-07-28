/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ConversationLogger, type ConversationEntry } from './ConversationLogger.js';
import { DEFAULT_LOGGING_SETTINGS } from '../config/settings.js';

// Mock the filesystem
vi.mock('fs/promises');

const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockMkdir = vi.mocked(fs.mkdir);
const mockAccess = vi.mocked(fs.access);
const mockStat = vi.mocked(fs.stat);
const mockReaddir = vi.mocked(fs.readdir);
const mockUnlink = vi.mocked(fs.unlink);
const mockRename = vi.mocked(fs.rename);
const mockChmod = vi.mocked(fs.chmod);

// Mock mkdirp
vi.mock('mkdirp', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock os.homedir to use a temp directory
vi.mock('os', () => ({
  ...vi.importActual('os'),
  homedir: vi.fn(() => '/mock/home'),
}));

describe('ConversationLogger', () => {
  let logger: ConversationLogger;
  const testLogDir = '/mock/home/.config/gemini/logs';
  const testLogFile = path.join(testLogDir, 'conversation_history.json');
  
  // Sample conversation entry for testing
  const sampleEntry: Omit<ConversationEntry, 'timestamp'> = {
    model: 'test-model',
    prompt: 'Test prompt',
    textResponse: 'Test response',
    fullResponse: { data: 'test' },
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Default mock implementations
    mockAccess.mockRejectedValue(new Error('File does not exist'));
    mockStat.mockResolvedValue({ size: 0 } as any);
    mockReadFile.mockResolvedValue('[]');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
    
    // Create a new logger instance for each test
    logger = new ConversationLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default settings', async () => {
      await logger.init();
      
      expect(mockMkdir).toHaveBeenCalledWith(
        testLogDir,
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        testLogFile,
        '[]',
        { mode: 0o600 }
      );
    });

    it('should use custom log directory when provided', async () => {
      const customDir = '/custom/log/dir';
      const customLogger = new ConversationLogger({
        logDirectory: customDir,
      });
      
      await customLogger.init();
      
      expect(mockMkdir).toHaveBeenCalledWith(
        customDir,
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(customDir, 'conversation_history.json'),
        '[]',
        { mode: 0o600 }
      );
    });
  });

  describe('log', () => {
    it('should log a new entry', async () => {
      await logger.init();
      
      await logger.log(sampleEntry);
      
      // Verify the log file was written with the new entry
      const expectedLog = [{
        ...sampleEntry,
        timestamp: expect.any(String),
      }];
      
      expect(mockWriteFile).toHaveBeenCalledWith(
        testLogFile,
        JSON.stringify(expectedLog, null, 2),
        { mode: 0o600 }
      );
    });

    it('should respect maxLogEntries setting', async () => {
      // Create a logger with a small maxLogEntries for testing
      const testLogger = new ConversationLogger({
        maxLogEntries: 2,
      });
      
      // Mock existing logs
      const existingLogs = [
        { ...sampleEntry, timestamp: '2023-01-01T00:00:00.000Z' },
        { ...sampleEntry, timestamp: '2023-01-02T00:00:00.000Z' },
      ];
      
      mockReadFile.mockResolvedValueOnce(JSON.stringify(existingLogs));
      
      await testLogger.init();
      await testLogger.log(sampleEntry);
      
      // Should only keep the 2 most recent entries
      const writtenData = JSON.parse(mockWriteFile.mock.calls[1][1] as string);
      expect(writtenData).toHaveLength(2);
      expect(writtenData[0].timestamp).toBe(existingLogs[1].timestamp);
      expect(writtenData[1].timestamp).toBe(existingLogs[0].timestamp);
    });
  });

  describe('log rotation', () => {
    it('should rotate logs when max file size is reached', async () => {
      const testLogger = new ConversationLogger({
        maxLogFileSizeMB: 0.001, // 1KB for testing
      });
      
      // Mock file size to be larger than max
      mockStat.mockResolvedValueOnce({ size: 2000 } as any);
      
      await testLogger.init();
      
      // Should have rotated the log file
      expect(mockRename).toHaveBeenCalledWith(
        testLogFile,
        expect.stringMatching(/\.log$/)
      );
      
      // Should have created a new empty log file
      expect(mockWriteFile).toHaveBeenCalledWith(
        testLogFile,
        '[]',
        { mode: 0o600 }
      );
    });
    
    it('should respect maxBackupCount setting', async () => {
      const testLogger = new ConversationLogger({
        maxBackupCount: 2,
      });
      
      // Mock existing rotated log files
      const rotatedFiles = [
        'conversation_history.json.2023-01-01T00-00-00-000Z.log',
        'conversation_history.json.2023-01-02T00-00-00-000Z.log',
        'conversation_history.json.2023-01-03T00-00-00-000Z.log',
      ];
      
      mockReaddir.mockResolvedValueOnce(rotatedFiles as any);
      
      await testLogger.init();
      
      // Should delete the oldest log file
      expect(mockUnlink).toHaveBeenCalledWith(
        path.join(testLogDir, rotatedFiles[0])
      );
    });
  });

  describe('cleanupOldLogs', () => {
    it('should remove logs older than retentionDays', async () => {
      const testLogger = new ConversationLogger({
        retentionDays: 7,
      });
      
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(now.getDate() - 10); // 10 days old
      
      const recentDate = new Date(now);
      recentDate.setDate(now.getDate() - 5); // 5 days old
      
      const oldLogs = [
        { ...sampleEntry, timestamp: oldDate.toISOString() },
        { ...sampleEntry, timestamp: recentDate.toISOString() },
      ];
      
      mockReadFile.mockResolvedValueOnce(JSON.stringify(oldLogs));
      
      await testLogger.init();
      await testLogger.cleanupOldLogs();
      
      // Should only keep the recent log
      const writtenData = JSON.parse(mockWriteFile.mock.calls[1][1] as string);
      expect(writtenData).toHaveLength(1);
      expect(writtenData[0].timestamp).toBe(recentDate.toISOString());
    });
    
    it('should not remove any logs if retentionDays is 0', async () => {
      const testLogger = new ConversationLogger({
        retentionDays: 0, // Disable retention
      });
      
      const oldLogs = [
        { ...sampleEntry, timestamp: '2023-01-01T00:00:00.000Z' },
      ];
      
      mockReadFile.mockResolvedValueOnce(JSON.stringify(oldLogs));
      
      await testLogger.init();
      await testLogger.cleanupOldLogs();
      
      // Should not have written anything
      expect(mockWriteFile).toHaveBeenCalledTimes(1); // Only the initial write
    });
  });

  describe('getLogs', () => {
    it('should return the requested number of logs', async () => {
      const logs = [
        { ...sampleEntry, timestamp: '2023-01-01T00:00:00.000Z' },
        { ...sampleEntry, timestamp: '2023-01-02T00:00:00.000Z' },
        { ...sampleEntry, timestamp: '2023-01-03T00:00:00.000Z' },
      ];
      
      mockReadFile.mockResolvedValueOnce(JSON.stringify(logs));
      
      await logger.init();
      const result = await logger.getLogs(2);
      
      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe(logs[2].timestamp); // Most recent first
      expect(result[1].timestamp).toBe(logs[1].timestamp);
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', async () => {
      await logger.init();
      await logger.clearLogs();
      
      expect(mockWriteFile).toHaveBeenCalledWith(
        testLogFile,
        '[]',
        { mode: 0o600 }
      );
    });
  });

  describe('error handling', () => {
    it('should handle read errors gracefully', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('Read error'));
      
      await logger.init();
      const logs = await logger.getLogs();
      
      expect(logs).toHaveLength(0);
    });
    
    it('should handle write errors gracefully', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Write error'));
      
      await logger.init();
      
      // Should not throw
      await expect(logger.log(sampleEntry)).resolves.not.toThrow();
    });
  });
});
