/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';

interface FileOpsParams {
  /** Operation type */
  op: 'renameFile' | 'moveFile' | 'copyFile' | 'deleteFile' | 'mkdir' | 'rmdir' | 'batchFile' | 'batchDir';
  /** Source file/directory path */
  source?: string;
  /** Target file/directory path (for rename/move/copy) */
  target?: string;
  /** Batch operation type (move, copy, rename, delete) */
  operation?: 'move' | 'copy' | 'rename' | 'delete';
  /** Multiple source files for batch operations */
  sources?: string[];
  /** Target directory for batch operations */
  targetDir?: string;
  /** Source directory for pattern matching in batch operations */
  sourceDir?: string;
  /** File pattern for batch operations (e.g., "*.xls", "stock_val*") */
  pattern?: string;
}

interface FileOpsResult extends ToolResult {
  success: boolean;
  op: string;
  source: string;
  target?: string;
}

class FileOpsInvocation extends BaseToolInvocation<FileOpsParams, FileOpsResult> {
  constructor(params: FileOpsParams) {
    super(params);
  }

  getDescription(): string {
    const { op, source, target, operation, sources, pattern, sourceDir } = this.params;
    
    if (op === 'batchFile') {
      const count = sources?.length || 0;
      const patternText = pattern ? ` matching "${pattern}"` : '';
      const sourceDirText = sourceDir ? ` from "${sourceDir}"` : '';
      const sourceDesc = count > 0 ? `${count} files` : `files${patternText}${sourceDirText}`;
      return `BatchFile ${operation}: ${sourceDesc} to "${target || 'target directory'}"`;
    }

    if (op === 'batchDir') {
      const count = sources?.length || 0;
      const patternText = pattern ? ` matching "${pattern}"` : '';
      const sourceDirText = sourceDir ? ` from "${sourceDir}"` : '';
      const sourceDesc = count > 0 ? `${count} directories` : `directories${patternText}${sourceDirText}`;
      return `BatchDir ${operation}: ${sourceDesc} to "${target || 'target directory'}"`;
    }
    
    const baseName = source ? path.basename(source) : 'file';
    
    switch (op) {
      case 'renameFile':
      case 'moveFile':
        return `${op === 'renameFile' ? 'Renaming' : 'Moving'} "${baseName}" to "${target ? path.basename(target) : ''}"`;
      case 'copyFile':
        return `Copying "${baseName}" to "${target ? path.basename(target) : ''}"`;
      case 'deleteFile':
        return `Deleting "${baseName}"`;
      case 'mkdir':
        return `Creating directory "${baseName}"`;
      case 'rmdir':
        return `Removing directory "${baseName}"`;
      default:
        return `File operation: ${op}`;
    }
  }

  async execute(signal: AbortSignal): Promise<FileOpsResult> {
    const { op } = this.params;

    try {
      signal.throwIfAborted();
      
      switch (op) {
        case 'renameFile':
        case 'moveFile':
          return await this.renameOrMove(signal);
        case 'copyFile':
          return await this.copyFile(signal);
        case 'deleteFile':
          return await this.deleteFile(signal);
        case 'mkdir':
          return await this.createDirectory(signal);
        case 'rmdir':
          return await this.removeDirectory(signal);
        case 'batchFile':
          return await this.batchOperation(signal);
        case 'batchDir':
          return await this.batchDirOperation(signal);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    } catch (error) {
      if (signal.aborted) {
        return this.createErrorResult('Operation cancelled');
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(message);
    }
  }

  private async renameOrMove(signal: AbortSignal): Promise<FileOpsResult> {
    const { source, target } = this.params;
    
    if (!source) {
      throw new Error('Source path required for rename/move operation');
    }
    
    if (!target) {
      throw new Error('Target path required for rename/move operation');
    }
    
    if (!existsSync(source)) {
      throw new Error(`Source "${source}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    // Use fs.rename which handles both rename and move operations
    await fs.rename(source, target);
    
    return this.createSuccessResult(`Successfully ${this.params.op === 'renameFile' ? 'renamed' : 'moved'} "${path.basename(source)}" to "${path.basename(target)}"`);
  }

  private async copyFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { source, target } = this.params;
    
    if (!source) {
      throw new Error('Source path required for copy operation');
    }
    
    if (!target) {
      throw new Error('Target path required for copy operation');
    }
    
    if (!existsSync(source)) {
      throw new Error(`Source file "${source}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    // Use fs.copyFile for real file copying
    await fs.copyFile(source, target);
    
    return this.createSuccessResult(`Successfully copied "${path.basename(source)}" to "${path.basename(target)}"`);
  }

  private async deleteFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { source } = this.params;
    
    if (!source) {
      throw new Error('Source path required for delete operation');
    }
    
    if (!existsSync(source)) {
      throw new Error(`File "${source}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    const stat = await fs.lstat(source);
    if (stat.isDirectory()) {
      throw new Error(`"${source}" is a directory, use rmdir operation instead`);
    }
    
    // Use fs.unlink for real file deletion
    await fs.unlink(source);
    
    return this.createSuccessResult(`Successfully deleted "${path.basename(source)}"`);
  }

  private async createDirectory(signal: AbortSignal): Promise<FileOpsResult> {
    const { target: targetDir } = this.params;
    
    if (!targetDir) {
      throw new Error('target parameter required for mkdir operation');
    }
    
    signal.throwIfAborted();
    
    // Use fs.mkdir with recursive option
    await fs.mkdir(targetDir, { recursive: true });
    
    return this.createSuccessResult(`Successfully created directory "${path.basename(targetDir)}"`);
  }

  private async removeDirectory(signal: AbortSignal): Promise<FileOpsResult> {
    const { source: targetDir } = this.params;
    
    if (!targetDir) {
      throw new Error('Target directory path required for rmdir operation');
    }
    
    if (!existsSync(targetDir)) {
      throw new Error(`Directory "${targetDir}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    const stat = await fs.lstat(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`"${targetDir}" is not a directory, use delete operation instead`);
    }
    
    // Use fs.rmdir with recursive option for non-empty directories
    await fs.rmdir(targetDir, { recursive: true });
    
    return this.createSuccessResult(`Successfully removed directory "${path.basename(targetDir)}"`);
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    // Create target directory
    await fs.mkdir(target, { recursive: true });
    
    // Read source directory contents
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        await this.copyDirectory(srcPath, destPath);
      } else {
        // Copy file
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async batchOperation(signal: AbortSignal): Promise<FileOpsResult> {
    const { operation, sources, targetDir, pattern, target, sourceDir } = this.params;
    
    if (!operation) {
      throw new Error('operation parameter required for batch operation');
    }
    
    if (!['move', 'copy', 'rename', 'delete'].includes(operation)) {
      throw new Error(`Unsupported batch operation: ${operation}`);
    }
    
    // For move and copy operations, we need targetDir
    // For rename operations, we need target pattern or specific mapping
    // For delete operations, we don't need targetDir
    if (['move', 'copy'].includes(operation)) {
      if (!targetDir) {
        throw new Error(`targetDir required for batch ${operation} operation`);
      }
      
      if (!existsSync(targetDir)) {
        throw new Error(`Target directory "${targetDir}" does not exist`);
      }
    }
    
    signal.throwIfAborted();
    
    let filesToProcess: string[] = [];
    
    if (sources && sources.length > 0) {
      // Use provided source files
      filesToProcess = sources;
    } else if (pattern) {
      // Find files using pattern
      const searchDir = sourceDir || process.cwd();
      filesToProcess = await glob(pattern, { cwd: searchDir, absolute: true });
    } else {
      throw new Error('Either sources array or pattern required for batch operation');
    }
    
    const results: Array<{ file: string; success: boolean; error?: string; targetPath?: string }> = [];
    let successCount = 0;
    
    for (const sourceFile of filesToProcess) {
      if (signal.aborted) break;
      
      try {
        if (!existsSync(sourceFile)) {
          results.push({ file: sourceFile, success: false, error: 'File does not exist' });
          continue;
        }
        
        let targetPath: string | undefined;
        
        if (operation === 'delete') {
          // For delete, no target path needed
          await fs.unlink(sourceFile);
        } else {
          if (operation === 'rename' && target) {
            // For rename, use the provided target directly or generate based on pattern
            targetPath = target;
          } else {
            // For move/copy, construct target path in targetDir
            const fileName = path.basename(sourceFile);
            targetPath = path.join(targetDir!, fileName);
          }
          
          switch (operation) {
            case 'move':
              await fs.rename(sourceFile, targetPath);
              break;
            case 'copy':
              await fs.copyFile(sourceFile, targetPath);
              break;
            case 'rename':
              await fs.rename(sourceFile, targetPath);
              break;
            default:
              break;
          }
        }
        
        results.push({ file: sourceFile, success: true, targetPath });
        successCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ file: sourceFile, success: false, error: errorMsg });
      }
    }
    
    const operationPastTense = {
      move: 'moved',
      copy: 'copied',
      rename: 'renamed',
      delete: 'deleted'
    }[operation];
    
    const summary = `${operationPastTense} ${successCount} of ${filesToProcess.length} files`;
    const details = results.map(r => {
      const fileName = path.basename(r.file);
      if (r.success) {
        const targetName = r.targetPath ? path.basename(r.targetPath) : 'target';
        return `- ${fileName}: ${operationPastTense} to ${targetName}`;
      } else {
        return `- ${fileName}: failed (${r.error})`;
      }
    }).join('\n');
    
    return {
      success: successCount > 0,
      op: 'batchFile',
      source: `${filesToProcess.length} files`,
      target: targetDir || target,
      llmContent: `fileops(batchFile_${operation}): ${summary}\n${details}`,
      returnDisplay: `fileops(batchFile_${operation}): ${summary}`,
    };
  }

  private async batchDirOperation(signal: AbortSignal): Promise<FileOpsResult> {
    const { operation, sources, targetDir, pattern, target, sourceDir } = this.params;
    
    if (!operation) {
      throw new Error('operation parameter required for batchDir operation');
    }
    
    if (!['move', 'copy', 'rename', 'delete'].includes(operation)) {
      throw new Error(`Unsupported batchDir operation: ${operation}`);
    }
    
    // For move and copy operations, we need targetDir
    // For delete operations, we don't need targetDir
    if (['move', 'copy'].includes(operation)) {
      if (!targetDir) {
        throw new Error(`targetDir required for batchDir ${operation} operation`);
      }
      
      if (!existsSync(targetDir)) {
        throw new Error(`Target directory "${targetDir}" does not exist`);
      }
    }
    
    signal.throwIfAborted();
    
    let dirsToProcess: string[] = [];
    
    if (sources && sources.length > 0) {
      // Use provided source directories
      dirsToProcess = sources;
    } else if (pattern) {
      // Find directories using pattern
      const searchDir = sourceDir || process.cwd();
      const allMatches = await glob(pattern, { cwd: searchDir, absolute: true });
      // Filter to only directories
      dirsToProcess = [];
      for (const match of allMatches) {
        if (existsSync(match)) {
          const stat = await fs.lstat(match);
          if (stat.isDirectory()) {
            dirsToProcess.push(match);
          }
        }
      }
    } else {
      throw new Error('Either sources array or pattern required for batchDir operation');
    }
    
    const results: Array<{ dir: string; success: boolean; error?: string; targetPath?: string }> = [];
    let successCount = 0;
    
    for (const sourceDir of dirsToProcess) {
      if (signal.aborted) break;
      
      try {
        if (!existsSync(sourceDir)) {
          results.push({ dir: sourceDir, success: false, error: 'Directory does not exist' });
          continue;
        }
        
        const stat = await fs.lstat(sourceDir);
        if (!stat.isDirectory()) {
          results.push({ dir: sourceDir, success: false, error: 'Not a directory' });
          continue;
        }
        
        let targetPath: string | undefined;
        
        if (operation === 'delete') {
          // For delete, remove directory recursively
          await fs.rmdir(sourceDir, { recursive: true });
        } else {
          if (operation === 'rename' && target) {
            targetPath = target;
          } else {
            // For move/copy, construct target path in targetDir
            const dirName = path.basename(sourceDir);
            targetPath = path.join(targetDir!, dirName);
          }
          
          switch (operation) {
            case 'move':
              await fs.rename(sourceDir, targetPath);
              break;
            case 'copy':
              await this.copyDirectory(sourceDir, targetPath);
              break;
            case 'rename':
              await fs.rename(sourceDir, targetPath);
              break;
            default:
              break;
          }
        }
        
        results.push({ dir: sourceDir, success: true, targetPath });
        successCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ dir: sourceDir, success: false, error: errorMsg });
      }
    }
    
    const operationPastTense = {
      move: 'moved',
      copy: 'copied',
      rename: 'renamed',
      delete: 'deleted'
    }[operation];
    
    const summary = `${operationPastTense} ${successCount} of ${dirsToProcess.length} directories`;
    const details = results.map(r => {
      const dirName = path.basename(r.dir);
      if (r.success) {
        const targetName = r.targetPath ? path.basename(r.targetPath) : 'target';
        return `- ${dirName}: ${operationPastTense} to ${targetName}`;
      } else {
        return `- ${dirName}: failed (${r.error})`;
      }
    }).join('\n');
    
    return {
      success: successCount > 0,
      op: 'batchDir',
      source: `${dirsToProcess.length} directories`,
      target: targetDir || target,
      llmContent: `fileops(batchDir_${operation}): ${summary}\n${details}`,
      returnDisplay: `fileops(batchDir_${operation}): ${summary}`,
    };
  }

  private createSuccessResult(message: string): FileOpsResult {
    return {
      success: true,
      op: this.params.op,
      source: this.params.source || 'unknown',
      target: this.params.target,
      llmContent: `fileops(${this.params.op}): ${message}`,
      returnDisplay: `fileops(${this.params.op}): ${message}`,
    };
  }

  private createErrorResult(message: string): FileOpsResult {
    return {
      success: false,
      op: this.params.op,
      source: this.params.source || 'unknown',
      target: this.params.target,
      llmContent: `fileops(${this.params.op}): FAILED - ${message}`,
      returnDisplay: `fileops(${this.params.op}): ${message}`,
      error: {
        message,
        type: ToolErrorType.FILE_OPERATION_FAILED,
      },
    };
  }
}

export class FileTool extends BaseDeclarativeTool<FileOpsParams, FileOpsResult> {
  constructor() {
    super(
      'file_ops',
      'File Operations',
      'File operations: single file operations (rename, move, copy, delete) and batch operations for multiple files. For multiple files or patterns, ALWAYS use op: "batch". Uses real Node.js filesystem APIs.',
      Kind.Other,
      {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: ['renameFile', 'moveFile', 'copyFile', 'deleteFile', 'mkdir', 'rmdir', 'batchFile', 'batchDir'],
            description: 'Operation: renameFile (single file), moveFile (single file to different location), copyFile (single file), deleteFile (single file), mkdir (create directory), rmdir (remove directory), batchFile (perform operation on multiple files), batchDir (perform operation on multiple directories - REQUIRED for moving/copying multiple directories)'
          },
          source: { 
            type: 'string', 
            description: 'Source file or directory path (not used for mkdir)' 
          },
          target: { 
            type: 'string', 
            description: 'Target file or directory path (required for single-file rename/move/copy/mkdir operations, NOT used for batch operations)' 
          },
          operation: {
            type: 'string',
            enum: ['move', 'copy', 'rename', 'delete'],
            description: 'Batch operation type: move (files/directories to directory), copy (files/directories to directory), rename (files/directories with pattern), delete (remove files/directories) - ONLY used with op: "batchFile" or "batchDir"'
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of source file paths for batch operations'
          },
          targetDir: {
            type: 'string',
            description: 'Target directory for batch move/copy operations - REQUIRED when using op: "batch" with operation: "move" or "copy"'
          },
          sourceDir: {
            type: 'string',
            description: 'Source directory for pattern matching in batch operations (defaults to current directory)'
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files (e.g., "*.pdf", "stock_val*.xls") - used with op: "batch" and sourceDir'
          }
        },
        additionalProperties: false
      }
    );
  }

  protected override validateToolParamValues(params: FileOpsParams): string | null {
    const { op, target, operation, sources, pattern, targetDir } = params;
    
    // Check if operations that require target have target parameter
    if (['renameFile', 'moveFile', 'copyFile'].includes(op) && !target) {
      return `Operation '${op}' requires 'target' parameter`;
    }
    
    // Check mkdir operation
    if (op === 'mkdir' && !target) {
      return 'mkdir operation requires \'target\' parameter';
    }
    
    // Validate batchFile operation parameters
    if (op === 'batchFile') {
      if (!operation) {
        return 'BatchFile operation requires \'operation\' parameter (move, copy, rename, or delete)';
      }
      
      if (!sources && !pattern) {
        return 'BatchFile operation requires either \'sources\' array or \'pattern\' parameter';
      }
      
      if (['move', 'copy'].includes(operation) && !targetDir) {
        return `BatchFile ${operation} operation requires 'targetDir' parameter`;
      }
      
      if (operation === 'rename' && !target && !targetDir) {
        return 'BatchFile rename operation requires either \'target\' or \'targetDir\' parameter';
      }
      
      // Delete operation doesn't require targetDir or target
    }

    // Validate batchDir operation parameters
    if (op === 'batchDir') {
      if (!operation) {
        return 'BatchDir operation requires \'operation\' parameter (move, copy, or rename)';
      }
      
      if (!sources && !pattern) {
        return 'BatchDir operation requires either \'sources\' array or \'pattern\' parameter';
      }
      
      if (['move', 'copy'].includes(operation) && !targetDir) {
        return `BatchDir ${operation} operation requires 'targetDir' parameter`;
      }
      
      if (operation === 'rename' && !target && !targetDir) {
        return 'BatchDir rename operation requires either \'target\' or \'targetDir\' parameter';
      }
      
      // Delete operation doesn't require targetDir or target
    }
    
    return null;
  }

  protected createInvocation(params: FileOpsParams): FileOpsInvocation {
    return new FileOpsInvocation(params);
  }
}

export const fileTool = new FileTool();