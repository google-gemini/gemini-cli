/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';

interface FileOpsParams {
  /** Operation type */
  op: 'rename' | 'move' | 'copy' | 'delete' | 'mkdir' | 'rmdir';
  /** Source file/directory path */
  source: string;
  /** Target file/directory path (for rename/move/copy) */
  target?: string;
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
    const { op, source, target } = this.params;
    const baseName = path.basename(source);
    
    switch (op) {
      case 'rename':
      case 'move':
        return `${op === 'rename' ? 'Renaming' : 'Moving'} "${baseName}" to "${target ? path.basename(target) : ''}"`;
      case 'copy':
        return `Copying "${baseName}" to "${target ? path.basename(target) : ''}"`;
      case 'delete':
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
        case 'rename':
        case 'move':
          return await this.renameOrMove(signal);
        case 'copy':
          return await this.copyFile(signal);
        case 'delete':
          return await this.deleteFile(signal);
        case 'mkdir':
          return await this.createDirectory(signal);
        case 'rmdir':
          return await this.removeDirectory(signal);
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
    
    if (!target) {
      throw new Error('Target path required for rename/move operation');
    }
    
    if (!existsSync(source)) {
      throw new Error(`Source "${source}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    // Use fs.rename which handles both rename and move operations
    await fs.rename(source, target);
    
    return this.createSuccessResult(`Successfully ${this.params.op === 'rename' ? 'renamed' : 'moved'} "${path.basename(source)}" to "${path.basename(target)}"`);
  }

  private async copyFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { source, target } = this.params;
    
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
    const { source } = this.params;
    
    signal.throwIfAborted();
    
    // Use fs.mkdir with recursive option
    await fs.mkdir(source, { recursive: true });
    
    return this.createSuccessResult(`Successfully created directory "${path.basename(source)}"`);
  }

  private async removeDirectory(signal: AbortSignal): Promise<FileOpsResult> {
    const { source } = this.params;
    
    if (!existsSync(source)) {
      throw new Error(`Directory "${source}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    const stat = await fs.lstat(source);
    if (!stat.isDirectory()) {
      throw new Error(`"${source}" is not a directory, use delete operation instead`);
    }
    
    // Use fs.rmdir with recursive option for non-empty directories
    await fs.rmdir(source, { recursive: true });
    
    return this.createSuccessResult(`Successfully removed directory "${path.basename(source)}"`);
  }

  private createSuccessResult(message: string): FileOpsResult {
    return {
      success: true,
      op: this.params.op,
      source: this.params.source,
      target: this.params.target,
      llmContent: `fileops(${this.params.op}): ${message}`,
      returnDisplay: `fileops(${this.params.op}): ${message}`,
    };
  }

  private createErrorResult(message: string): FileOpsResult {
    return {
      success: false,
      op: this.params.op,
      source: this.params.source,
      target: this.params.target,
      llmContent: `fileops(${this.params.op}): Failed - ${message}`,
      returnDisplay: `fileops(${this.params.op}): Failed - ${message}`,
      error: {
        message,
        type: 'FILE_OPERATION_FAILED' as any,
      },
    };
  }
}

export class FileTool extends BaseDeclarativeTool<FileOpsParams, FileOpsResult> {
  constructor() {
    super(
      'file_ops',
      'File Operations',
      'Basic file operations: rename files, move files, copy files, delete files, create/remove directories. Uses real Node.js filesystem APIs.',
      Kind.Other,
      {
        type: 'object',
        required: ['op', 'source'],
        properties: {
          op: {
            type: 'string',
            enum: ['rename', 'move', 'copy', 'delete', 'mkdir', 'rmdir'],
            description: 'Operation: rename (file), move (file to different location), copy (file), delete (file), mkdir (create directory), rmdir (remove directory)'
          },
          source: { 
            type: 'string', 
            description: 'Source file or directory path' 
          },
          target: { 
            type: 'string', 
            description: 'Target file or directory path (required for rename/move/copy operations)' 
          }
        },
        additionalProperties: false
      }
    );
  }

  protected override validateToolParamValues(params: FileOpsParams): string | null {
    const { op, target } = params;
    
    // Check if operations that require target have target parameter
    if (['rename', 'move', 'copy'].includes(op) && !target) {
      return `Operation '${op}' requires 'target' parameter`;
    }
    
    return null;
  }

  protected createInvocation(params: FileOpsParams): FileOpsInvocation {
    return new FileOpsInvocation(params);
  }
}

export const fileTool = new FileTool();