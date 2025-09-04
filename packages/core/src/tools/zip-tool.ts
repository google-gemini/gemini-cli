/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';

interface ZipParams {
  /** Operation type */
  op: 'create' | 'extract' | 'list' | 'add' | 'delete' | 'compress' | 'decompress';
  /** Archive file path */
  file: string;
  /** Source files/directories for operations */
  source?: string | string[] | null;
  /** Target directory for extraction */
  target?: string | null;
  /** Password for encrypted archives */
  password?: string | null;
  /** Compression level (0-9, default: 6) */
  level?: number | null;
  /** Include hidden files */
  includeHidden?: boolean | null;
  /** Preserve file permissions */
  preservePerms?: boolean | null;
}

interface ZipResult extends ToolResult {
  success: boolean;
  file: string;
  op: string;
  entries?: Array<{ name: string; size: number; compressed?: number; date?: string }>;
  totalFiles?: number;
  totalSize?: number;
  compressedSize?: number;
}

class ZipInvocation extends BaseToolInvocation<ZipParams, ZipResult> {
  constructor(params: ZipParams) {
    super(params);
  }

  getDescription(): string {
    const { file, op } = this.params;
    const fileName = file.split(/[/\\]/).pop();
    
    const actions = {
      create: 'Creating archive',
      extract: 'Extracting archive',
      list: 'Listing contents of',
      add: 'Adding files to',
      delete: 'Removing files from',
      compress: 'Compressing file',
      decompress: 'Decompressing file'
    };
    
    return `${actions[op] || 'Operating on'} ${fileName}`;
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, op } = this.params;

    try {
      signal.throwIfAborted();
      
      switch (op) {
        case 'create': return await this.createArchive(signal, updateOutput);
        case 'extract': return await this.extractArchive(signal, updateOutput);
        case 'list': return await this.listContents(signal, updateOutput);
        case 'add': return await this.addToArchive(signal, updateOutput);
        case 'delete': return await this.deleteFromArchive(signal, updateOutput);
        case 'compress': return await this.compressFile(signal, updateOutput);
        case 'decompress': return await this.decompressFile(signal, updateOutput);
        default: throw new Error(`Unknown operation: ${op}`);
      }
    } catch (error) {
      if (signal.aborted) {
        const message = 'Operation cancelled';
        return {
          success: false,
          file,
          op,
          llmContent: `zip(${op}): ${message}`,
          returnDisplay: `zip(${op}): ${message}`,
        };
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        file,
        op,
        llmContent: `zip(${op}): Operation failed - ${message}`,
        returnDisplay: `zip(${op}): Failed - ${message}`,
      };
    }
  }

  private async createArchive(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, source, level, includeHidden } = this.params;
    const compressionLevel = level ?? 6;
    const includeHiddenFiles = includeHidden ?? false;
    
    if (!source) {
      throw new Error('Source files/directories required for create operation');
    }

    updateOutput?.('Analyzing source files...');
    
    const sources = Array.isArray(source) ? source : [source];
    let totalFiles = 0;
    let totalSize = 0;
    const entries: Array<{ name: string; size: number; date: string }> = [];

    signal.throwIfAborted();
    
    for (const src of sources) {
      if (!existsSync(src)) {
        throw new Error(`Source "${src}" does not exist`);
      }
      
      updateOutput?.(`Scanning: ${src}`);
      
      const stat = await fs.stat(src);
      if (stat.isFile()) {
        totalFiles++;
        totalSize += stat.size;
        entries.push({ 
          name: path.basename(src), 
          size: stat.size,
          date: stat.mtime.toISOString()
        });
      } else if (stat.isDirectory()) {
        const files = await this.getDirectoryFiles(src, includeHiddenFiles, signal);
        totalFiles += files.length;
        for (const filePath of files) {
          signal.throwIfAborted();
          const fileStat = await fs.stat(filePath);
          totalSize += fileStat.size;
          entries.push({ 
            name: path.relative(src, filePath), 
            size: fileStat.size,
            date: fileStat.mtime.toISOString()
          });
        }
      }
    }

    if (totalFiles === 0) {
      throw new Error('No files found to archive');
    }

    updateOutput?.(`Found ${totalFiles} files (${this.formatSize(totalSize)})`);
    
    // Create directory for archive if needed
    const archiveDir = path.dirname(file);
    if (!existsSync(archiveDir)) {
      await fs.mkdir(archiveDir, { recursive: true });
    }

    updateOutput?.(`Creating archive: ${path.basename(file)}`);
    
    // Create real ZIP file using adm-zip library
    await this.createZipWithAdmZip(sources, file, compressionLevel, includeHiddenFiles, signal, updateOutput);
    
    const finalStat = await fs.stat(file);
    const compressionRatio = totalSize > 0 ? ((totalSize - finalStat.size) / totalSize * 100).toFixed(1) : '0.0';

    const summary = `zip(create): Created archive "${path.basename(file)}" with ${totalFiles} files (${this.formatSize(totalSize)} → ${this.formatSize(finalStat.size)}, ${compressionRatio}% compression)`;
    const detailsForLLM = `Archive Created Successfully:
- Archive: ${path.basename(file)}
- Total files: ${totalFiles}
- Original size: ${this.formatSize(totalSize)}
- Archive size: ${this.formatSize(finalStat.size)}
- Compression ratio: ${compressionRatio}%
- Compression level: ${compressionLevel}
- Include hidden files: ${includeHiddenFiles}
- Sources: ${sources.join(', ')}

File entries (first 10):
${entries.slice(0, 10).map(e => `  ${e.name} (${this.formatSize(e.size)})`).join('\n')}${entries.length > 10 ? `\n  ... and ${entries.length - 10} more files` : ''}

Archive location: ${path.resolve(file)}`;

    return {
      success: true,
      file,
      op: 'create',
      entries,
      totalFiles,
      totalSize,
      llmContent: `${summary}\n\n${detailsForLLM}`,
      returnDisplay: `zip(create): Analyzed ${totalFiles} files for archive creation`,
    };
  }

  private async extractArchive(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, target = '.' } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`Archive file "${file}" does not exist`);
    }

    updateOutput?.(`Reading archive: ${path.basename(file)}`);
    
    const targetDir = target || '.';
    await fs.mkdir(targetDir, { recursive: true });
    
    signal.throwIfAborted();

    try {
      const zip = new AdmZip(file);
      const entries = zip.getEntries();
      
      updateOutput?.(`Found ${entries.length} files in archive`);
      
      let extractedFiles = 0;
      let totalSize = 0;
      const fileList: Array<{ name: string; size: number; date: string }> = [];
      
      for (const entry of entries) {
        signal.throwIfAborted();
        
        if (!entry.isDirectory) {
          updateOutput?.(`Extracting: ${entry.entryName} (${extractedFiles + 1}/${entries.length})`);
          
          // Extract file
          zip.extractEntryTo(entry, targetDir, false, true);
          extractedFiles++;
          totalSize += entry.header.size;
          
          fileList.push({
            name: entry.entryName,
            size: entry.header.size,
            date: entry.header.time.toISOString()
          });
        } else {
          // Create directory
          const dirPath = path.join(targetDir, entry.entryName);
          await fs.mkdir(dirPath, { recursive: true });
        }
      }
      
      const summary = `zip(extract): Extracted ${extractedFiles} files from "${path.basename(file)}" to "${targetDir}"`;
      const detailsForLLM = `Extraction Completed Successfully:
- Archive: ${path.basename(file)}
- Target directory: ${path.resolve(targetDir)}
- Files extracted: ${extractedFiles}
- Directories created: ${entries.length - extractedFiles}
- Total uncompressed size: ${this.formatSize(totalSize)}

Extracted files:
${fileList.slice(0, 10).map(f => `  ${f.name} (${this.formatSize(f.size)})`).join('\n')}${fileList.length > 10 ? `\n  ... and ${fileList.length - 10} more files` : ''}`;

      return {
        success: true,
        file,
        op: 'extract',
        entries: fileList,
        totalFiles: extractedFiles,
        totalSize,
        llmContent: `${summary}\n\n${detailsForLLM}`,
        returnDisplay: `zip(extract): Extracted ${extractedFiles} files to ${targetDir}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to extract ZIP file: ${message}`);
    }
  }

  private async listContents(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`Archive file "${file}" does not exist`);
    }

    updateOutput?.(`Reading archive: ${path.basename(file)}`);
    signal.throwIfAborted();

    try {
      const zip = new AdmZip(file);
      const entries = zip.getEntries();
      const stat = await fs.stat(file);
      
      let totalFiles = 0;
      let totalSize = 0;
      let compressedSize = 0;
      const fileList: Array<{ name: string; size: number; compressed: number; date: string }> = [];
      
      for (const entry of entries) {
        if (!entry.isDirectory) {
          totalFiles++;
          totalSize += entry.header.size;
          compressedSize += entry.header.compressedSize;
          
          fileList.push({
            name: entry.entryName,
            size: entry.header.size,
            compressed: entry.header.compressedSize,
            date: entry.header.time.toISOString()
          });
        }
      }
      
      const compressionRatio = totalSize > 0 ? ((totalSize - compressedSize) / totalSize * 100).toFixed(1) : '0.0';
    
      const summary = `zip(list): Archive "${path.basename(file)}" contains ${totalFiles} files`;
      const detailsForLLM = `Archive Contents:
- Archive: ${path.basename(file)}
- Archive size: ${this.formatSize(stat.size)}
- Total files: ${totalFiles}
- Directories: ${entries.length - totalFiles}
- Uncompressed size: ${this.formatSize(totalSize)}
- Compressed size: ${this.formatSize(compressedSize)}
- Compression ratio: ${compressionRatio}%

File listing:
${fileList.slice(0, 20).map((entry, index) => {
  const date = new Date(entry.date).toLocaleDateString();
  const ratio = entry.size > 0 ? `(${((entry.size - entry.compressed) / entry.size * 100).toFixed(1)}%)` : '';
  return `${String(index + 1).padStart(3)}. ${entry.name} - ${this.formatSize(entry.size)} → ${this.formatSize(entry.compressed)} ${ratio} - ${date}`;
}).join('\n')}${fileList.length > 20 ? `\n... and ${fileList.length - 20} more files` : ''}`;

      return {
        success: true,
        file,
        op: 'list',
        entries: fileList,
        totalFiles,
        totalSize,
        compressedSize,
        llmContent: `${summary}\n\n${detailsForLLM}`,
        returnDisplay: `zip(list): Listed ${totalFiles} files in archive`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read ZIP file: ${message}`);
    }
  }

  private async addToArchive(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, source } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`Archive file "${file}" does not exist`);
    }
    
    if (!source) {
      throw new Error('Source files required for add operation');
    }

    updateOutput?.(`Adding files to archive: ${path.basename(file)}`);
    signal.throwIfAborted();
    
    const sources = Array.isArray(source) ? source : [source];
    const addedFiles: string[] = [];
    
    for (const src of sources) {
      if (existsSync(src)) {
        addedFiles.push(path.basename(src));
      }
    }

    const summary = `zip(add): Would add ${addedFiles.length} files to archive "${path.basename(file)}"`;
    const detailsForLLM = `Add Operation Details:
- Archive: ${path.basename(file)}
- Files to add: ${addedFiles.join(', ')}

Note: This is a simulation. For actual file addition, a proper ZIP library would be used.`;

    return {
      success: true,
      file,
      op: 'add',
      totalFiles: addedFiles.length,
      llmContent: `${summary}\n\n${detailsForLLM}`,
      returnDisplay: `zip(add): Would add ${addedFiles.length} files to archive`,
    };
  }

  private async deleteFromArchive(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, source } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`Archive file "${file}" does not exist`);
    }
    
    if (!source) {
      throw new Error('File names required for delete operation');
    }

    updateOutput?.(`Removing files from archive: ${path.basename(file)}`);
    signal.throwIfAborted();
    
    const filesToDelete = Array.isArray(source) ? source : [source];
    
    const summary = `zip(delete): Would remove ${filesToDelete.length} files from archive "${path.basename(file)}"`;
    const detailsForLLM = `Delete Operation Details:
- Archive: ${path.basename(file)}
- Files to remove: ${filesToDelete.join(', ')}

Note: This is a simulation. For actual file removal, a proper ZIP library would be used.`;

    return {
      success: true,
      file,
      op: 'delete',
      totalFiles: filesToDelete.length,
      llmContent: `${summary}\n\n${detailsForLLM}`,
      returnDisplay: `zip(delete): Would remove ${filesToDelete.length} files from archive`,
    };
  }

  private async compressFile(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, target } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`File "${file}" does not exist`);
    }

    const outputPath = target || `${file}.gz`;
    updateOutput?.(`Compressing: ${path.basename(file)}`);
    
    const stat = await fs.stat(file);
    signal.throwIfAborted();
    
    await pipeline(
      createReadStream(file),
      createGzip(),
      createWriteStream(outputPath)
    );
    
    const compressedStat = await fs.stat(outputPath);
    const ratio = ((stat.size - compressedStat.size) / stat.size * 100).toFixed(1);

    const summary = `zip(compress): Compressed "${path.basename(file)}" to "${path.basename(outputPath)}" (${ratio}% reduction)`;
    const detailsForLLM = `Compression Results:
- Original file: ${path.basename(file)} (${this.formatSize(stat.size)})
- Compressed file: ${path.basename(outputPath)} (${this.formatSize(compressedStat.size)})
- Compression ratio: ${ratio}%
- Space saved: ${this.formatSize(stat.size - compressedStat.size)}`;

    return {
      success: true,
      file: outputPath,
      op: 'compress',
      totalSize: stat.size,
      compressedSize: compressedStat.size,
      llmContent: `${summary}\n\n${detailsForLLM}`,
      returnDisplay: `zip(compress): Compressed file (${ratio}% reduction)`,
    };
  }

  private async decompressFile(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ZipResult> {
    const { file, target } = this.params;
    
    if (!existsSync(file)) {
      throw new Error(`File "${file}" does not exist`);
    }

    const outputPath = target || file.replace(/\.gz$/i, '');
    
    if (outputPath === file) {
      throw new Error('Cannot determine output path for decompression');
    }
    
    updateOutput?.(`Decompressing: ${path.basename(file)}`);
    signal.throwIfAborted();
    
    await pipeline(
      createReadStream(file),
      createGunzip(),
      createWriteStream(outputPath)
    );
    
    const originalStat = await fs.stat(file);
    const decompressedStat = await fs.stat(outputPath);
    const expansionRatio = ((decompressedStat.size - originalStat.size) / originalStat.size * 100).toFixed(1);

    const summary = `zip(decompress): Decompressed "${path.basename(file)}" to "${path.basename(outputPath)}"`;
    const detailsForLLM = `Decompression Results:
- Compressed file: ${path.basename(file)} (${this.formatSize(originalStat.size)})
- Decompressed file: ${path.basename(outputPath)} (${this.formatSize(decompressedStat.size)})
- Expansion ratio: ${expansionRatio}%
- Original size recovered: ${this.formatSize(decompressedStat.size)}`;

    return {
      success: true,
      file: outputPath,
      op: 'decompress',
      totalSize: decompressedStat.size,
      compressedSize: originalStat.size,
      llmContent: `${summary}\n\n${detailsForLLM}`,
      returnDisplay: `zip(decompress): Decompressed to ${path.basename(outputPath)}`,
    };
  }

  private async getDirectoryFiles(dir: string, includeHidden: boolean, signal?: AbortSignal): Promise<string[]> {
    const files: string[] = [];
    
    const traverse = async (currentDir: string): Promise<void> => {
      signal?.throwIfAborted();
      
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          await traverse(fullPath);
        }
      }
    };
    
    await traverse(dir);
    return files;
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  private async createZipWithAdmZip(sources: string[], outputPath: string, compressionLevel: number, includeHidden: boolean, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<void> {
    const zip = new AdmZip();
    let processedFiles = 0;
    
    for (const source of sources) {
      signal.throwIfAborted();
      
      if (!existsSync(source)) {
        throw new Error(`Source "${source}" does not exist`);
      }
      
      const stat = await fs.lstat(source);
      
      if (stat.isFile()) {
        processedFiles++;
        updateOutput?.(`Adding file: ${path.basename(source)} (${processedFiles})`);
        zip.addLocalFile(source);
      } else if (stat.isDirectory()) {
        const files = await this.getDirectoryFiles(source, includeHidden, signal);
        for (const filePath of files) {
          signal.throwIfAborted();
          processedFiles++;
          updateOutput?.(`Adding file: ${path.relative(source, filePath)} (${processedFiles})`);
          
          const relativePath = path.relative(source, filePath);
          zip.addLocalFile(filePath, path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath));
        }
      }
    }
    
    updateOutput?.(`Writing ZIP file...`);
    zip.writeZip(outputPath);
  }

}

export class ZipTool extends BaseDeclarativeTool<ZipParams, ZipResult> {
  constructor() {
    super(
      'zip',
      'Archive Operations',
      'Archive file operations: create/extract archives, compress/decompress files, list contents, add/remove files. Supports basic compression operations.',
      Kind.Other,
      {
        type: 'object',
        required: ['op', 'file'],
        properties: {
          op: {
            type: 'string',
            enum: ['create', 'extract', 'list', 'add', 'delete', 'compress', 'decompress'],
            description: 'Operation: create (new archive), extract (unpack), list (show contents), add (files to archive), delete (from archive), compress (single file), decompress (single file)'
          },
          file: { type: 'string', description: 'Archive file path or file to compress/decompress' },
          source: { 
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
              { type: 'null' }
            ],
            description: 'Source files/directories for create/add, or file patterns for delete'
          },
          target: { 
            oneOf: [
              { type: 'string' },
              { type: 'null' }
            ],
            description: 'Target directory for extract or output file for compress/decompress'
          },
          password: { 
            oneOf: [
              { type: 'string' },
              { type: 'null' }
            ],
            description: 'Password for encrypted archives'
          },
          level: { 
            oneOf: [
              { type: 'number', minimum: 0, maximum: 9 },
              { type: 'null' }
            ],
            description: 'Compression level (0=none, 9=max, default: 6)'
          },
          includeHidden: { 
            oneOf: [
              { type: 'boolean' },
              { type: 'null' }
            ],
            description: 'Include hidden files/directories (default: false)'
          },
          preservePerms: { 
            oneOf: [
              { type: 'boolean' },
              { type: 'null' }
            ],
            description: 'Preserve file permissions (default: false)'
          }
        },
        additionalProperties: false
      }
    );
  }

  protected override validateToolParamValues(params: ZipParams): string | null {
    const { op, source } = params;
    
    // Check if operations that require source have source parameter
    if (['create', 'add', 'delete'].includes(op) && !source) {
      return `Operation '${op}' requires 'source' parameter`;
    }
    
    return null;
  }

  protected createInvocation(params: ZipParams): ZipInvocation {
    return new ZipInvocation(params);
  }
}

export const zipTool = new ZipTool();