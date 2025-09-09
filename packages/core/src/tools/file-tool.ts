/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { PartUnion } from '@google/genai';
import mime from 'mime-types';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import type { 
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';

interface FileOpsParams {
  /** Operation type */
  op: 'renameFile' | 'moveFile' | 'copyFile' | 'deleteFile' | 'mkdir' | 'rmdir' | 'batchFile' | 'batchDir' | 'writeFile' | 'appendFile' | 'readFile';
  /** Source file/directory path */
  source?: string;
  /** Target file/directory path (for rename/move/copy) */
  target?: string;
  /** Content to write/append to file */
  content?: string;
  /** File path for write/append/read operations */
  file_path?: string;
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
  /** Line number to start reading from (for readFile) */
  offset?: number;
  /** Number of lines to read (for readFile) */
  limit?: number;
}

interface FileOpsResult extends ToolResult {
  success: boolean;
  op: string;
  source: string;
  target?: string;
}

class FileOpsInvocation extends BaseToolInvocation<FileOpsParams, FileOpsResult> {
  constructor(
    private readonly config: Config,
    params: FileOpsParams
  ) {
    super(params);
  }

  getDescription(): string {
    const { op, source, target, operation, sources, pattern, sourceDir, file_path } = this.params;
    
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

    if (op === 'writeFile' || op === 'appendFile') {
      const filePath = file_path || source;
      const fileName = filePath ? path.basename(filePath) : 'file';
      return op === 'writeFile' ? `Writing to "${fileName}"` : `Appending to "${fileName}"`;
    }

    if (op === 'readFile') {
      const filePath = file_path || source;
      const fileName = filePath ? path.basename(filePath) : 'file';
      return `Reading "${fileName}"`;
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
        case 'writeFile':
          return await this.writeFile(signal);
        case 'appendFile':
          return await this.appendFile(signal);
        case 'readFile':
          return await this.readFile(signal);
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

  private async writeFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { file_path, content } = this.params;
    
    if (!file_path) {
      throw new Error('File path required for writeFile operation');
    }
    
    if (content === undefined) {
      throw new Error('Content required for writeFile operation');
    }
    
    signal.throwIfAborted();
    
    // Ensure parent directory exists
    const parentDir = path.dirname(file_path);
    if (parentDir && !existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    
    const fileType = this.detectWriteFileType(file_path, content);
    
    if (fileType === 'image') {
      // Handle image file (expect base64 content)
      try {
        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        const base64Content = content.replace(/^data:image\/[^;]+;base64,/, '');
        
        // Validate base64 format
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Content)) {
          throw new Error('Invalid base64 format for image content');
        }
        
        const imageBuffer = Buffer.from(base64Content, 'base64');
        await fs.writeFile(file_path, imageBuffer);
        
        const message = `Successfully wrote image file: ${file_path}.`;
        return {
          success: true,
          op: 'writeFile',
          source: file_path,
          llmContent: message,
          returnDisplay: message,
        };
      } catch (error) {
        throw new Error(`Failed to write image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Handle text files and special format files (SVG, CSV, JSON, XML, etc.)
      await fs.writeFile(file_path, content, 'utf8');
      
      const message = `Successfully overwrote file: ${file_path}.`;
      return {
        success: true,
        op: 'writeFile',
        source: file_path,
        llmContent: message,
        returnDisplay: message,
      };
    }
  }

  private async appendFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { file_path, content } = this.params;
    
    if (!file_path) {
      throw new Error('File path required for appendFile operation');
    }
    
    if (content === undefined) {
      throw new Error('Content required for appendFile operation');
    }
    
    signal.throwIfAborted();
    
    // Ensure parent directory exists
    const parentDir = path.dirname(file_path);
    if (parentDir && !existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    
    // Append to the file
    await fs.appendFile(file_path, content, 'utf8');
    
    const message = `Successfully appended content to file: ${file_path}.`;
    
    return {
      success: true,
      op: 'appendFile',
      source: file_path,
      llmContent: message,
      returnDisplay: message,
    };
  }

  private async readFile(signal: AbortSignal): Promise<FileOpsResult> {
    const { file_path, offset, limit } = this.params;
    
    if (!file_path) {
      throw new Error('File path required for readFile operation');
    }
    
    if (!existsSync(file_path)) {
      throw new Error(`File "${file_path}" does not exist`);
    }
    
    signal.throwIfAborted();
    
    const fileName = path.basename(file_path);
    const fileType = this.detectFileType(file_path);
    
    if (fileType === 'image') {
      // Read image file as base64
      const contentBuffer = await fs.readFile(file_path);
      const base64Data = contentBuffer.toString('base64');
      const mimeType = mime.lookup(file_path) || 'application/octet-stream';
      
      const imageContent: PartUnion = {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
      
      return {
        success: true,
        op: 'readFile',
        source: file_path,
        llmContent: imageContent,
        returnDisplay: `Successfully read image file: ${fileName}`,
      };
    } else if (fileType === 'text') {
      // Read text file with optional pagination
      const content = await fs.readFile(file_path, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      let resultContent: string;
      let displayMessage: string;
      
      if (offset !== undefined || limit !== undefined) {
        // Apply pagination
        const startLine = offset || 0;
        const maxLines = limit || 2000;
        const endLine = Math.min(startLine + maxLines, totalLines);
        
        if (startLine >= totalLines) {
          throw new Error(`Offset ${startLine} exceeds file length (${totalLines} lines)`);
        }
        
        const selectedLines = lines.slice(startLine, endLine);
        resultContent = selectedLines.join('\n');
        
        const isTruncated = startLine > 0 || endLine < totalLines;
        if (isTruncated) {
          const nextOffset = endLine;
          displayMessage = `Read lines ${startLine + 1}-${endLine} of ${totalLines} from ${fileName}`;
          if (endLine < totalLines) {
            resultContent = `IMPORTANT: The file content has been truncated.
Status: Showing lines ${startLine + 1}-${endLine} of ${totalLines} total lines.
Action: To read more of the file, use offset: ${nextOffset}.

--- FILE CONTENT (truncated) ---
${resultContent}`;
          }
        } else {
          displayMessage = `Successfully read file: ${fileName}`;
        }
      } else {
        // Read entire file (up to default limit)
        const maxLines = 2000;
        if (totalLines > maxLines) {
          const selectedLines = lines.slice(0, maxLines);
          resultContent = selectedLines.join('\n');
          const nextOffset = maxLines;
          resultContent = `IMPORTANT: The file content has been truncated.
Status: Showing lines 1-${maxLines} of ${totalLines} total lines.
Action: To read more of the file, use offset: ${nextOffset}.

--- FILE CONTENT (truncated) ---
${resultContent}`;
          displayMessage = `Read lines 1-${maxLines} of ${totalLines} from ${fileName}`;
        } else {
          resultContent = content;
          displayMessage = `Successfully read file: ${fileName}`;
        }
      }
      
      return {
        success: true,
        op: 'readFile',
        source: file_path,
        llmContent: resultContent,
        returnDisplay: displayMessage,
      };
    } else {
      throw new Error(`Unsupported file type for reading: ${fileName}. Only text and image files are supported.`);
    }
  }

  private detectFileType(filePath: string): 'text' | 'image' | 'other' {
    const ext = path.extname(filePath).toLowerCase();
    
    // TypeScript files should be treated as text
    if (['.ts', '.mts', '.cts', '.tsx'].includes(ext)) {
      return 'text';
    }
    
    const lookedUpMimeType = mime.lookup(filePath);
    if (lookedUpMimeType && typeof lookedUpMimeType === 'string') {
      if (lookedUpMimeType.startsWith('image/')) {
        return 'image';
      }
    }
    
    // Common image extensions
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    if (imageExtensions.includes(ext)) {
      return 'image';
    }
    
    // Common text extensions and fallback
    const textExtensions = ['.txt', '.md', '.js', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.xml', '.json', '.yaml', '.yml', '.ini', '.conf', '.log'];
    if (textExtensions.includes(ext) || (lookedUpMimeType && typeof lookedUpMimeType === 'string' && lookedUpMimeType.startsWith('text/'))) {
      return 'text';
    }
    
    // Default to text for unknown extensions (can be overridden)
    return 'text';
  }

  private detectWriteFileType(filePath: string, content: string): 'text' | 'image' {
    const ext = path.extname(filePath).toLowerCase();
    
    // Binary image extensions (excluding SVG which is text-based)
    const binaryImageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
    if (binaryImageExtensions.includes(ext)) {
      return 'image';
    }
    
    // Check if content looks like base64 data URL for images
    if (content.startsWith('data:image/') || 
        (content.match(/^[A-Za-z0-9+/]*={0,2}$/) && content.length > 100)) {
      return 'image';
    }
    
    // Everything else is treated as text (including SVG, CSV, JSON, XML, etc.)
    return 'text';
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

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Skip confirmation for YOLO mode
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return false;
    }

    const params = this.params;
    const isDestructiveOperation = this.isDestructiveOperation(params);
    
    // Only require confirmation for destructive operations
    if (!isDestructiveOperation) {
      return false;
    }

    const operationDescription = this.getOperationDescription(params);
    const command = this.formatCommandDisplay(params);

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: `Confirm File Operation`,
      command,
      rootCommand: operationDescription,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          // For file operations, we could set a flag to skip confirmation for similar operations
          // But since file operations can be varied, we'll keep per-operation confirmation
        }
      },
    };

    return confirmationDetails;
  }

  private isDestructiveOperation(params: FileOpsParams): boolean {
    const { op, operation } = params;
    
    // Single file destructive operations
    if (['deleteFile', 'rmdir', 'moveFile'].includes(op)) {
      return true;
    }
    
    // File writing operations that might overwrite existing content
    if (['writeFile', 'appendFile'].includes(op)) {
      return true;
    }
    
    // Batch destructive operations
    if ((op === 'batchFile' || op === 'batchDir') && ['delete', 'move'].includes(operation || '')) {
      return true;
    }
    
    // Operations that might overwrite existing files
    if (['copyFile', 'renameFile'].includes(op)) {
      return true;
    }
    
    if ((op === 'batchFile' || op === 'batchDir') && ['copy', 'rename'].includes(operation || '')) {
      return true;
    }
    
    return false;
  }

  private getOperationDescription(params: FileOpsParams): string {
    const { op, operation } = params;
    
    if (op === 'batchFile' || op === 'batchDir') {
      return `Batch ${operation} ${op === 'batchFile' ? 'files' : 'directories'}`;
    }
    
    switch (op) {
      case 'deleteFile':
        return 'Delete file';
      case 'rmdir':
        return 'Remove directory';
      case 'moveFile':
        return 'Move file';
      case 'copyFile':
        return 'Copy file';
      case 'renameFile':
        return 'Rename file';
      case 'writeFile':
        return 'Write file';
      case 'appendFile':
        return 'Append to file';
      default:
        return `File operation: ${op}`;
    }
  }

  private formatCommandDisplay(params: FileOpsParams): string {
    const { op, source, target, sources, pattern, sourceDir, targetDir, operation } = params;
    
    if (op === 'batchFile' || op === 'batchDir') {
      const sourceDesc = sources?.length 
        ? `${sources.length} items: ${sources.slice(0, 3).join(', ')}${sources.length > 3 ? '...' : ''}`
        : pattern 
          ? `pattern "${pattern}" in ${sourceDir || '.'}`
          : 'multiple items';
      
      return `${operation} ${sourceDesc} -> ${targetDir || 'target directory'}`;
    }
    
    const sourceName = source ? path.basename(source) : 'source';
    const targetName = target ? path.basename(target) : 'target';
    const filePath = params.file_path ? path.basename(params.file_path) : sourceName;
    
    switch (op) {
      case 'deleteFile':
        return `rm "${sourceName}"`;
      case 'rmdir':
        return `rmdir "${sourceName}"`;
      case 'moveFile':
        return `mv "${sourceName}" -> "${targetName}"`;
      case 'copyFile':
        return `cp "${sourceName}" -> "${targetName}"`;
      case 'renameFile':
        return `rename "${sourceName}" -> "${targetName}"`;
      case 'mkdir':
        return `mkdir "${targetName}"`;
      case 'writeFile':
        return `write "${filePath}"`;
      case 'appendFile':
        return `append "${filePath}"`;
      default:
        return `${op} "${sourceName}"`;
    }
  }
}

export class FileTool extends BaseDeclarativeTool<FileOpsParams, FileOpsResult> {
  constructor(private readonly config: Config) {
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
            enum: ['renameFile', 'moveFile', 'copyFile', 'deleteFile', 'mkdir', 'rmdir', 'batchFile', 'batchDir', 'writeFile', 'appendFile', 'readFile'],
            description: 'Operation: renameFile (single file), moveFile (single file to different location), copyFile (single file), deleteFile (single file), mkdir (create directory), rmdir (remove directory), batchFile (perform operation on multiple files), batchDir (perform operation on multiple directories - REQUIRED for moving/copying multiple directories), writeFile (write content to file), appendFile (append content to file), readFile (read file content)'
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
          },
          content: {
            type: 'string',
            description: 'Content to write or append to file - REQUIRED for writeFile and appendFile operations. For text files: provide text content. For image files (.png, .jpg, .gif, .webp, .bmp): provide base64-encoded content (with or without data URL prefix)'
          },
          file_path: {
            type: 'string',
            description: 'File path for write/append/read operations - REQUIRED for writeFile, appendFile, and readFile operations'
          },
          offset: {
            type: 'number',
            description: 'For readFile (text files): 0-based line number to start reading from. Use with limit for pagination.'
          },
          limit: {
            type: 'number',
            description: 'For readFile (text files): maximum number of lines to read. Use with offset for pagination. Default is 2000 lines.'
          }
        },
        additionalProperties: false
      }
    );
  }

  protected override validateToolParamValues(params: FileOpsParams): string | null {
    const { op, target, operation, sources, pattern, targetDir, content, file_path, offset, limit } = params;
    
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

    // Validate writeFile and appendFile operations
    if (['writeFile', 'appendFile'].includes(op)) {
      if (!file_path) {
        return `${op} operation requires 'file_path' parameter`;
      }
      
      if (content === undefined) {
        return `${op} operation requires 'content' parameter`;
      }
    }

    // Validate readFile operation
    if (op === 'readFile') {
      if (!file_path) {
        return 'readFile operation requires \'file_path\' parameter';
      }
      
      if (offset !== undefined && offset < 0) {
        return 'offset must be a non-negative number';
      }
      
      if (limit !== undefined && limit <= 0) {
        return 'limit must be a positive number';
      }
    }
    
    return null;
  }

  protected createInvocation(params: FileOpsParams): FileOpsInvocation {
    return new FileOpsInvocation(this.config, params);
  }
}

// export const fileTool = new FileTool(); // Removed: Tools now require config parameter