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

  constructor(settings?: Partial<LoggingSettings>) {
    this.settings = { ...DEFAULT_LOGGING_SETTINGS, ...(settings || {}) };
    this.logFile = path.join(
      this.settings.logDirectory,
      'conversation_history.json'
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    await mkdirp(path.dirname(this.logFile));
    
    // Set file permissions (read/write for user only)
    const dirMode = 0o700; // drwx------
    const fileMode = 0o600; // -rw-------
    
    try {
      // Ensure directory permissions
      await fs.chmod(path.dirname(this.logFile), dirMode);
      
      // Initialize log file if it doesn't exist
      if (!await this.fileExists(this.logFile)) {
        await fs.writeFile(this.logFile, '[]', { mode: fileMode });
      } else {
        // Check if rotation is needed
        await this.checkAndRotateLogs();
      }
      
      // Update current log size and entry count
      await this.updateLogStats();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ConversationLogger:', error);
      throw error;
    }
  }

  async log(entry: Omit<ConversationEntry, 'timestamp'>): Promise<void> {
    if (!this.settings.enabled) return;
    
    await this.ensureInitialized();
    
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, ...entry };
    
    try {
      // Read current logs
      const logs = await this.readLogs();
      
      // Add new entry and maintain max entries limit
      logs.unshift(logEntry);
      const prunedLogs = logs.slice(0, this.settings.maxLogEntries);
      
      // Write back to file
      const logData = JSON.stringify(prunedLogs, null, 2);
      await fs.writeFile(this.logFile, logData, { mode: 0o600 });
      
      // Update stats
      this.currentLogSize = Buffer.byteLength(logData);
      this.logEntriesCount = prunedLogs.length;
      
      // Check if rotation is needed
      await this.checkAndRotateLogs();
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
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('Failed to read log file:', error);
      throw error;
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