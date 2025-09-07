/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import {
  BaseDeclarativeTool,  
} from './tools.js';
import type { ToolResult, ToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';

/**
 * Base interface for file operation parameters
 */
interface FileOperationParams {
  /** File path */
  file: string;
  /** Operation type */
  op: string;
}

/**
 * Base class for tools that support automatic file backup
 * Designed for document operation tools like Excel, PDF, Word, PowerPoint, etc.
 * 
 * Features:
 * - Automatically creates backups before modifying files
 * - Maintains up to 5 historical backups (rolling replacement)
 * - Provides undo operation to restore from most recent backup
 * - Stack-like behavior: backup on modify, restore on undo
 */
export abstract class BackupableTool<TParams extends FileOperationParams, TResult extends ToolResult>
  extends BaseDeclarativeTool<TParams, TResult> {

  private static readonly MAX_BACKUPS = 5;

  constructor(
    name: string,
    displayName: string,
    description: string,
    kind: Kind,
    parameterSchema: unknown,
    isOutputMarkdown: boolean = true,
    canUpdateOutput: boolean = false,
  ) {
    super(name, displayName, description, kind, parameterSchema, isOutputMarkdown, canUpdateOutput);
  }

  /**
   * Subclasses must implement: identify which operations modify files
   */
  protected abstract isModifyOperation(params: TParams): boolean;

  /**
   * Subclasses must implement: get the target file path for the operation
   */
  protected abstract getTargetFilePath(params: TParams): string | null;

  /**
   * Subclasses must implement: create the original tool invocation
   */
  protected abstract createOriginalInvocation(params: TParams): ToolInvocation<TParams, TResult>;

  /**
   * Get backup directory for a file
   */
  private getBackupDir(filePath: string): string {
    const dir = path.dirname(filePath);
    return path.join(dir, '.backups');
  }

  /**
   * Get backup file paths (numbered 1-5, 1 is most recent)
   */
  private getBackupPaths(filePath: string): string[] {
    const backupDir = this.getBackupDir(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    
    return Array.from({ length: BackupableTool.MAX_BACKUPS }, (_, i) => 
      path.join(backupDir, `${basename}.backup${i + 1}${ext}`)
    );
  }

  /**
   * Create backup before modifying file (stack push)
   */
  protected async createBackup(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      return;
    }

    try {
      const backupDir = this.getBackupDir(filePath);
      await fs.mkdir(backupDir, { recursive: true });
      
      const backupPaths = this.getBackupPaths(filePath);
      
      // Shift existing backups: backup1 -> backup2, backup2 -> backup3, etc.
      for (let i = BackupableTool.MAX_BACKUPS - 1; i > 0; i--) {
        const currentBackup = backupPaths[i - 1];
        const nextBackup = backupPaths[i];
        
        if (existsSync(currentBackup)) {
          await fs.rename(currentBackup, nextBackup);
        }
      }
      
      // Create new backup1 (most recent)
      await fs.copyFile(filePath, backupPaths[0]);
    } catch (error) {
      // Backup failure should not block operation
      console.warn(`Failed to create backup for ${filePath}:`, error);
    }
  }

  /**
   * Restore from most recent backup (stack pop)
   */
  protected async undoLastOperation(filePath: string): Promise<void> {
    const backupPaths = this.getBackupPaths(filePath);
    const mostRecentBackup = backupPaths[0];
    
    if (!existsSync(mostRecentBackup)) {
      throw new Error(`No backup available for ${path.basename(filePath)}`);
    }
    
    // Restore from backup1
    await fs.copyFile(mostRecentBackup, filePath);
    
    // Shift backups down: backup2 -> backup1, backup3 -> backup2, etc.
    for (let i = 0; i < BackupableTool.MAX_BACKUPS - 1; i++) {
      const currentBackup = backupPaths[i];
      const nextBackup = backupPaths[i + 1];
      
      if (existsSync(nextBackup)) {
        await fs.rename(nextBackup, currentBackup);
      } else {
        // No more backups, remove current
        try {
          await fs.unlink(currentBackup);
        } catch {
          // Ignore unlink errors
        }
        break;
      }
    }
  }

  /**
   * Override createInvocation to handle undo and add backup logic
   */
  protected override createInvocation(params: TParams): ToolInvocation<TParams, TResult> {
    // Handle undo operation
    if (params.op === 'undo') {
      return {
        params,
        getDescription: () => `Undo last operation on "${path.basename(params.file)}"`,
        toolLocations: () => [],
        shouldConfirmExecute: async () => false,
        execute: async (signal: AbortSignal) => {
          try {
            signal.throwIfAborted();
            await this.undoLastOperation(params.file);
            
            return {
              success: true,
              llmContent: `${this.name}(undo): Successfully restored "${path.basename(params.file)}" from backup`,
              returnDisplay: `${this.name}(undo): File restored from backup`,
            } as unknown as TResult;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
              success: false,
              llmContent: `${this.name}(undo): FAILED - ${message}`,
              returnDisplay: `${this.name}(undo): ${message}`,
              error: {
                message,
                type: ToolErrorType.EXECUTION_FAILED,
              },
            } as unknown as TResult;
          }
        }
      };
    }
    
    // For modify operations, create backup before execution
    const originalInvocation = this.createOriginalInvocation(params);
    const originalExecute = originalInvocation.execute.bind(originalInvocation);
    
    // Override execute to add backup logic
    originalInvocation.execute = async (signal: AbortSignal, updateOutput?: (output: string) => void): Promise<TResult> => {
      // Create backup before modify operations
      if (this.isModifyOperation(params)) {
        const filePath = this.getTargetFilePath(params);
        if (filePath) {
          await this.createBackup(filePath);
        }
      }
      
      // Execute original operation
      return originalExecute(signal, updateOutput);
    };
    
    return originalInvocation;
  }
}



export type { FileOperationParams };