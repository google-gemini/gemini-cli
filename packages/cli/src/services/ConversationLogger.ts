/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdirp } from 'mkdirp';
import { homedir } from 'os';
import { LoggingSettings, DEFAULT_LOGGING_SETTINGS } from '../config/settings.js';

export interface ConversationEntry {
  timestamp: string;
  model: string;
  prompt: string;
  fullResponse: any;
  textResponse: string;
}

export class ConversationLogger {
  private logFile: string;
  private settings: Required<LoggingSettings>;
  private currentLogSize: number = 0;
  private logEntriesCount: number = 0;
  private initialized: boolean = false;
  private writeQueue: Array<() => Promise<void>> = [];
  private isWriting: boolean = false;

  constructor(settings?: Partial<LoggingSettings>) {
    this.settings = { ...DEFAULT_LOGGING_SETTINGS, ...(settings || {}) };
    this.logFile = path.join(
      this.settings.logDirectory,
      'conversation_history.json'
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await mkdirp(path.dirname(this.logFile));
      await fs.chmod(path.dirname(this.logFile), 0o700);
      
      // Initialize or repair log file
      await this.initializeOrRepairLogFile();
      await this.updateLogStats();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ConversationLogger:', error);
      throw error;
    }
  }

  private async initializeOrRepairLogFile(): Promise<void> {
    try {
      const fileExists = await this.fileExists(this.logFile);
      if (fileExists) {
        try {
          const data = await fs.readFile(this.logFile, 'utf-8');
          JSON.parse(data); // Validate JSON
          return; // File is valid
        } catch (error) {
          console.warn('Log file is corrupted, resetting...');
          await this.backupCorruptedFile();
        }
      }
      await fs.writeFile(this.logFile, '[]', { mode: 0o600 });
    } catch (error) {
      console.error('Failed to initialize log file:', error);
      throw error;
    }
  }

  private async backupCorruptedFile(): Promise<void> {
    try {
      const backupFile = `${this.logFile}.corrupted.${Date.now()}.bak`;
      await fs.rename(this.logFile, backupFile);
      console.warn(`Corrupted log file backed up to: ${backupFile}`);
    } catch (e) {
      console.error('Failed to backup corrupted log file:', e);
      // Continue even if backup fails
    }
  }

  async log(entry: Omit<ConversationEntry, 'timestamp'>): Promise<void> {
    if (!this.settings.enabled) return;
    await this.ensureInitialized();
    
    return new Promise((resolve, reject) => {
      this.writeQueue.push(async () => {
        try {
          const timestamp = new Date().toISOString();
          const logEntry = { timestamp, ...entry };
          await this.processLogWrite(logEntry);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.isWriting) {
        this.processWriteQueue();
      }
    });
  }

  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) return;
    this.isWriting = true;
    
    try {
      const writeOperation = this.writeQueue.shift();
      if (writeOperation) await writeOperation();
    } finally {
      this.isWriting = false;
      setImmediate(() => this.processWriteQueue());
    }
  }

  private async processLogWrite(logEntry: ConversationEntry): Promise<void> {
    try {
      const logs = await this.readLogs();
      logs.unshift(logEntry);
      const prunedLogs = logs.slice(0, this.settings.maxLogEntries);
      
      const tempFile = `${this.logFile}.${Date.now()}.tmp`;
      const logData = JSON.stringify(prunedLogs, null, 2);
      
      try {
        await fs.writeFile(tempFile, logData, { mode: 0o600 });
        await fs.rename(tempFile, this.logFile);
        
        this.currentLogSize = Buffer.byteLength(logData);
        this.logEntriesCount = prunedLogs.length;
        
        await this.checkAndRotateLogs();
      } catch (error) {
        // Clean up temp file if it exists
        try { 
          if (await this.fileExists(tempFile)) {
            await fs.unlink(tempFile);
          }
        } catch (unlinkError) {
          console.error('Failed to clean up temp file:', unlinkError);
        }
        throw error; // Re-throw the original error
      }
    } catch (error) {
      console.error('Failed to write log entry:', error);
      throw error;
    }
  }

  async clearLogs(): Promise<void> {
    await this.ensureInitialized();
    await fs.writeFile(this.logFile, '[]', { mode: 0o600 });
    this.currentLogSize = 2; // Size of '[]'
    this.logEntriesCount = 0;
  }

  async getLogs(limit: number = 50): Promise<ConversationEntry[]> {
    await this.ensureInitialized();
    const logs = await this.readLogs();
    return logs.slice(0, limit);
  }

  async cleanupOldLogs(): Promise<void> {
    if (this.settings.retentionDays <= 0) return;
    
    await this.ensureInitialized();
    const logs = await this.readLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.settings.retentionDays);
    
    const filteredLogs = logs.filter(entry => {
      return new Date(entry.timestamp) >= cutoffDate;
    });
    
    if (filteredLogs.length < logs.length) {
      await fs.writeFile(
        this.logFile,
        JSON.stringify(filteredLogs, null, 2),
        { mode: 0o600 }
      );
      await this.updateLogStats();
    }
  }

  private async checkAndRotateLogs(): Promise<void> {
    // Check if rotation is needed based on file size
    if (this.currentLogSize < this.settings.maxLogFileSizeMB * 1024 * 1024) {
      return;
    }
    
    // Rotate logs
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = `${this.logFile}.${timestamp}.log`;
    
    try {
      // Rename current log file
      await fs.rename(this.logFile, rotatedFile);
      
      // Create new empty log file
      await fs.writeFile(this.logFile, '[]', { mode: 0o600 });
      
      // Clean up old log files
      await this.cleanupOldLogs();
      
      // Update stats
      this.currentLogSize = 2; // Size of '[]'
      this.logEntriesCount = 0;
      
      // Clean up old rotated files if we have too many
      await this.cleanupRotatedLogs();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
      throw error;
    }
  }

  private async cleanupRotatedLogs(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFile);
      const logBaseName = path.basename(this.logFile);
      const files = await fs.readdir(logDir);
      
      // Find all rotated log files
      const rotatedFiles = files
        .filter(file => file.startsWith(`${logBaseName}.`) && file.endsWith('.log'))
        .sort()
        .reverse();
      
      // Remove oldest files if we have more than maxBackupCount
      if (rotatedFiles.length > this.settings.maxBackupCount) {
        const filesToDelete = rotatedFiles.slice(this.settings.maxBackupCount);
        for (const file of filesToDelete) {
          await fs.unlink(path.join(logDir, file));
        }
      }
    } catch (error) {
      console.error('Failed to clean up rotated log files:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async readLogs(): Promise<ConversationEntry[]> {
    try {
      const data = await fs.readFile(this.logFile, 'utf-8');
      try {
        return JSON.parse(data);
      } catch (parseError) {
        // Handle JSON parsing errors
        console.error(`Failed to parse log file (${this.logFile}):`, parseError);
        // Create a backup of the corrupted file
        const backupFile = `${this.logFile}.corrupted.${Date.now()}`;
        await fs.rename(this.logFile, backupFile);
        console.error(`Created backup of corrupted log file at: ${backupFile}`);
        return [];
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      
      // Handle file not found
      if (err.code === 'ENOENT') {
        return [];
      }
      
      // Handle permission errors
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        console.error(`Permission denied when reading log file (${this.logFile}):`, err);
        throw new Error(`Insufficient permissions to read log file: ${this.logFile}`);
      }
      
      // Handle directory instead of file
      if (err.code === 'EISDIR') {
        console.error(`Expected a file but found a directory: ${this.logFile}`);
        throw new Error(`Log file path is a directory: ${this.logFile}`);
      }
      
      // Handle other filesystem errors
      console.error(`Failed to read log file (${this.logFile}):`, err);
      throw new Error(`Failed to read log file: ${err.message}`);
    }
  }

  private async updateLogStats(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFile);
      this.currentLogSize = stats.size;
      
      const logs = await this.readLogs();
      this.logEntriesCount = logs.length;
    } catch (error) {
      console.error('Failed to update log stats:', error);
      this.currentLogSize = 0;
      this.logEntriesCount = 0;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}