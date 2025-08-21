/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import micromatch from 'micromatch';
import { FileInfo, ScanStats } from './types.js';
import { EXCLUDED_DIRS, DEFAULT_SKIP_IF_LARGER_THAN } from './constants.js';
import { isTextFileElegant } from '../../utils/binaryFileUtils.js';

class IgnoreFileParser {
  private patterns: string[] = [];

  async loadIgnoreFiles(baseDir: string): Promise<void> {
    this.patterns = [];
    
    await this.loadIgnoreFile(baseDir, '.gitignore');
    
    await this.loadIgnoreFile(baseDir, '.geminiignore');
  }

  private async loadIgnoreFile(baseDir: string, filename: string): Promise<void> {
    const ignorePath = path.join(baseDir, filename);
    try {
      const content = await fs.readFile(ignorePath, 'utf-8');
      const newPatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      this.patterns.push(...newPatterns);
    } catch {
    }
  }

  isIgnored(relPath: string): boolean {
    const normalizedPath = relPath.replace(/\\/g, '/');
    
    for (const pattern of this.patterns) {
      if (this.matchesPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchesPattern(path: string, pattern: string): boolean {
    return micromatch.isMatch(path, pattern);
  }
}

export class CodebaseFileDiscoveryService {
  private readonly skipIfLargerThan: number;
  private readonly ignoreParser: IgnoreFileParser;

  constructor(skipIfLargerThan: number = DEFAULT_SKIP_IF_LARGER_THAN) {
    this.skipIfLargerThan = skipIfLargerThan;
    this.ignoreParser = new IgnoreFileParser();
  }

  async *scanDirectory(baseDir: string): AsyncGenerator<FileInfo> {
    const basePath = path.resolve(baseDir);
    
    await this.ignoreParser.loadIgnoreFiles(basePath);
    
    for await (const entry of this.walkDirectory(basePath)) {
      if (entry.isFile) {
        const fileInfo = await this.analyzeFile(entry.path, basePath);
        if (fileInfo) {
          yield fileInfo;
        }
      }
    }
  }

  async isTextFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        return false;
      }
      
      if (this.skipIfLargerThan && stats.size > this.skipIfLargerThan) {
        return false;
      }
    } catch {
      return false;
    }

    return await isTextFileElegant(filePath);
  }

  async getFileStats(baseDir: string): Promise<ScanStats> {
    const stats: ScanStats = {
      totalFiles: 0,
      textFiles: 0,
      binaryFiles: 0,
      largeFiles: 0,
      excludedFiles: 0
    };

    for await (const fileInfo of this.scanDirectory(baseDir)) {
      stats.totalFiles++;
      
      if (fileInfo.isText) {
        stats.textFiles++;
      } else {
        stats.binaryFiles++;
      }

      if (fileInfo.size > this.skipIfLargerThan) {
        stats.largeFiles++;
      }
    }

    return stats;
  }

  private async *walkDirectory(dirPath: string): AsyncGenerator<{ path: string; isFile: boolean }> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) {
            continue;
          }
          
          yield* this.walkDirectory(fullPath);
        } else if (entry.isFile()) {
          yield { path: fullPath, isFile: true };
        }
      }
    } catch (error) {
      console.warn(`Cannot read directory ${dirPath}:`, error);
    }
  }

  private async analyzeFile(filePath: string, baseDir: string): Promise<FileInfo | null> {
    try {
      const relPath = path.relative(baseDir, filePath).replace(/\\/g, '/');
      
      if (this.ignoreParser.isIgnored(relPath)) {
        return null;
      }
      
      const stats = await fs.stat(filePath);
      const isText = await this.isTextFile(filePath);
      
      return {
        path: filePath,
        isText,
        size: stats.size,
        mtime: stats.mtime
      };
    } catch {
      return null;
    }
  }
}
