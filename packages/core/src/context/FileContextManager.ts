/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FileContext,
  FileDiagnostic,
  FileMetadata,
  SymbolDefinition,
} from './memory-interfaces.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { LruCache } from '../utils/LruCache.js';

/**
 * Manages file context tracking and analysis
 */
export class FileContextManager {
  private fileContexts = new Map<string, FileContext>();
  private analysisCache = new LruCache<string, FileMetadata>(1000);

  /**
   * Get or create file context for the given file path
   */
  async getOrCreateFileContext(filePath: string): Promise<FileContext> {
    const normalizedPath = path.resolve(filePath);

    let context = this.fileContexts.get(normalizedPath);
    if (context) {
      // Check if file has been modified since last update
      try {
        const stats = await fs.stat(normalizedPath);
        if (stats.mtime.getTime() !== context.lastModified) {
          context = await this.updateFileContext(normalizedPath, stats);
        }
      } catch {
        // File doesn't exist anymore
        context = await this.createNonExistentFileContext(normalizedPath);
      }
    } else {
      context = await this.createFileContext(normalizedPath);
    }

    this.fileContexts.set(normalizedPath, context);
    return context;
  }

  /**
   * Get existing file context without creating
   */
  async getFileContext(filePath: string): Promise<FileContext | undefined> {
    const normalizedPath = path.resolve(filePath);
    return this.fileContexts.get(normalizedPath);
  }

  /**
   * Update dependencies for a file and update dependents
   */
  async updateDependencies(
    filePath: string,
    dependencies: string[],
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    const normalizedDeps = dependencies.map((dep) => path.resolve(dep));

    const context = await this.getOrCreateFileContext(normalizedPath);
    const oldDependencies = context.dependencies;

    // Update dependencies
    context.dependencies = normalizedDeps;
    context.lastUpdated = Date.now();

    // Update dependents for old dependencies (remove this file)
    for (const oldDep of oldDependencies) {
      const depContext = await this.getOrCreateFileContext(oldDep);
      depContext.dependents = depContext.dependents.filter(
        (dep) => dep !== normalizedPath,
      );
    }

    // Update dependents for new dependencies (add this file)
    for (const newDep of normalizedDeps) {
      const depContext = await this.getOrCreateFileContext(newDep);
      if (!depContext.dependents.includes(normalizedPath)) {
        depContext.dependents.push(normalizedPath);
      }
    }
  }

  /**
   * Update diagnostics for a file
   */
  async updateDiagnostics(
    filePath: string,
    diagnostics: FileDiagnostic[],
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    const context = await this.getOrCreateFileContext(normalizedPath);

    context.diagnostics = [...diagnostics];
    context.lastUpdated = Date.now();
  }

  /**
   * Update git status for a file
   */
  async updateGitStatus(
    filePath: string,
    gitStatus: FileContext['gitStatus'],
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    const context = await this.getOrCreateFileContext(normalizedPath);

    context.gitStatus = gitStatus;
    context.lastUpdated = Date.now();
  }

  /**
   * Create a new file context
   */
  private async createFileContext(filePath: string): Promise<FileContext> {
    try {
      const stats = await fs.stat(filePath);
      return await this.updateFileContext(filePath, stats);
    } catch {
      return await this.createNonExistentFileContext(filePath);
    }
  }

  /**
   * Create context for non-existent file
   */
  private async createNonExistentFileContext(
    filePath: string,
  ): Promise<FileContext> {
    return {
      filePath,
      lastModified: 0,
      size: 0,
      contentHash: '',
      fileType: this.detectFileType(filePath),
      encoding: 'utf-8',
      exists: false,
      dependencies: [],
      dependents: [],
      diagnostics: [],
      metadata: this.createEmptyMetadata(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Update file context with current file stats
   */
  private async updateFileContext(
    filePath: string,
    stats: { mtime: Date; size: number },
  ): Promise<FileContext> {
    const content = await this.readFileContent(filePath);
    const contentHash = this.calculateContentHash(content);
    const fileType = this.detectFileType(filePath);

    let metadata = this.analysisCache.get(contentHash);
    if (!metadata) {
      metadata = await this.analyzeFileContent(filePath, content, fileType);
      this.analysisCache.set(contentHash, metadata);
    }

    const dependencies = await this.extractDependencies(
      filePath,
      content,
      fileType,
    );

    return {
      filePath,
      lastModified: stats.mtime.getTime(),
      size: stats.size,
      contentHash,
      fileType,
      encoding: 'utf-8',
      exists: true,
      dependencies,
      dependents: [], // Will be updated by other files
      diagnostics: [],
      metadata,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Read file content safely
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Calculate content hash for change detection
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Detect file type from extension
   */
  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const typeMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.kt': 'kotlin',
      '.swift': 'swift',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.hpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.txt': 'text',
    };

    return typeMap[ext] || 'unknown';
  }

  /**
   * Create empty metadata structure
   */
  private createEmptyMetadata(): FileMetadata {
    return {
      lineCount: 0,
      tokenCount: 0,
      frameworks: [],
      exports: [],
      imports: [],
      definitions: [],
    };
  }

  /**
   * Analyze file content to extract metadata
   */
  private async analyzeFileContent(
    filePath: string,
    content: string,
    fileType: string,
  ): Promise<FileMetadata> {
    const lines = content.split('\n');
    const lineCount = lines.length;
    const tokenCount = this.estimateTokenCount(content);

    let language: string | undefined;
    let frameworks: string[] = [];
    let exports: string[] = [];
    let imports: string[] = [];
    let definitions: SymbolDefinition[] = [];

    switch (fileType) {
      case 'typescript':
      case 'javascript':
        language = fileType;
        frameworks = this.detectJavaScriptFrameworks(content);
        exports = this.extractJavaScriptExports(content);
        imports = this.extractJavaScriptImports(content);
        definitions = this.extractJavaScriptDefinitions(content);
        break;

      case 'python':
        language = 'python';
        frameworks = this.detectPythonFrameworks(content);
        exports = this.extractPythonExports(content);
        imports = this.extractPythonImports(content);
        definitions = this.extractPythonDefinitions(content);
        break;

      default:
        language = fileType;
    }

    return {
      lineCount,
      tokenCount,
      language,
      frameworks,
      exports,
      imports,
      definitions,
    };
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: average 4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Detect JavaScript/TypeScript frameworks
   */
  private detectJavaScriptFrameworks(content: string): string[] {
    const frameworks: string[] = [];

    if (content.includes("from 'react'") || content.includes('from "react"')) {
      frameworks.push('react');
    }
    if (content.includes("from 'next") || content.includes('from "next')) {
      frameworks.push('nextjs');
    }
    if (content.includes("from 'vue'") || content.includes('from "vue"')) {
      frameworks.push('vue');
    }
    if (
      content.includes("from 'angular") ||
      content.includes('from "angular')
    ) {
      frameworks.push('angular');
    }
    if (
      content.includes("from 'express'") ||
      content.includes('from "express"')
    ) {
      frameworks.push('express');
    }
    if (
      content.includes('import type') ||
      content.includes('interface ') ||
      content.includes('type ')
    ) {
      frameworks.push('typescript');
    }

    return frameworks;
  }

  /**
   * Extract JavaScript/TypeScript exports
   */
  private extractJavaScriptExports(content: string): string[] {
    const exports: string[] = [];

    // Match export declarations
    const exportPatterns = [
      /export\s+(?:const|let|var)\s+(\w+)/g,
      /export\s+function\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ];

    for (const pattern of exportPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1].includes(',')) {
          // Handle multiple exports in braces
          const multipleExports = match[1]
            .split(',')
            .map((name) => name.trim().split(' ')[0]);
          exports.push(...multipleExports);
        } else {
          exports.push(match[1]);
        }
      }
    }

    return [...new Set(exports)];
  }

  /**
   * Extract JavaScript/TypeScript imports
   */
  private extractJavaScriptImports(content: string): string[] {
    const imports: string[] = [];

    const importPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  }

  /**
   * Extract JavaScript/TypeScript definitions
   */
  private extractJavaScriptDefinitions(content: string): SymbolDefinition[] {
    const definitions: SymbolDefinition[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Function definitions
      const functionMatch = line.match(
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      );
      if (functionMatch) {
        definitions.push({
          name: functionMatch[1],
          type: 'function',
          line: lineNumber,
          access: line.includes('export') ? 'public' : 'private',
        });
      }

      // Class definitions
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        definitions.push({
          name: classMatch[1],
          type: 'class',
          line: lineNumber,
          access: line.includes('export') ? 'public' : 'private',
        });
      }

      // Interface definitions
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        definitions.push({
          name: interfaceMatch[1],
          type: 'interface',
          line: lineNumber,
          access: 'public',
        });
      }

      // Type definitions
      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        definitions.push({
          name: typeMatch[1],
          type: 'type',
          line: lineNumber,
          access: line.includes('export') ? 'public' : 'private',
        });
      }

      // Const/let/var definitions
      const varMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        definitions.push({
          name: varMatch[1],
          type: line.includes('const') ? 'constant' : 'variable',
          line: lineNumber,
          access: line.includes('export') ? 'public' : 'private',
        });
      }
    }

    return definitions;
  }

  /**
   * Detect Python frameworks
   */
  private detectPythonFrameworks(content: string): string[] {
    const frameworks: string[] = [];

    if (content.includes('from django') || content.includes('import django')) {
      frameworks.push('django');
    }
    if (content.includes('from flask') || content.includes('import flask')) {
      frameworks.push('flask');
    }
    if (
      content.includes('from fastapi') ||
      content.includes('import fastapi')
    ) {
      frameworks.push('fastapi');
    }

    return frameworks;
  }

  /**
   * Extract Python exports (functions and classes defined at module level)
   */
  private extractPythonExports(content: string): string[] {
    const exports: string[] = [];

    const patterns = [/^def\s+(\w+)/gm, /^class\s+(\w+)/gm];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return [...new Set(exports)];
  }

  /**
   * Extract Python imports
   */
  private extractPythonImports(content: string): string[] {
    const imports: string[] = [];

    const patterns = [/^import\s+(\w+)/gm, /^from\s+(\w+)\s+import/gm];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  /**
   * Extract Python definitions
   */
  private extractPythonDefinitions(content: string): SymbolDefinition[] {
    const definitions: SymbolDefinition[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Function definitions
      const functionMatch = line.match(/^(\s*)def\s+(\w+)/);
      if (functionMatch) {
        const _indentation = functionMatch[1];
        definitions.push({
          name: functionMatch[2],
          type: 'function',
          line: lineNumber,
          access: functionMatch[2].startsWith('_') ? 'private' : 'public',
        });
      }

      // Class definitions
      const classMatch = line.match(/^(\s*)class\s+(\w+)/);
      if (classMatch) {
        definitions.push({
          name: classMatch[2],
          type: 'class',
          line: lineNumber,
          access: 'public',
        });
      }
    }

    return definitions;
  }

  /**
   * Extract file dependencies from imports
   */
  private async extractDependencies(
    filePath: string,
    content: string,
    fileType: string,
  ): Promise<string[]> {
    const dependencies: string[] = [];
    const basePath = path.dirname(filePath);

    switch (fileType) {
      case 'typescript':
      case 'javascript':
        dependencies.push(
          ...(await this.extractJavaScriptDependencies(basePath, content)),
        );
        break;

      case 'python':
        dependencies.push(
          ...(await this.extractPythonDependencies(basePath, content)),
        );
        break;

      default:
        // No specific dependency extraction for this file type
        break;
    }

    return [...new Set(dependencies)];
  }

  /**
   * Extract JavaScript/TypeScript file dependencies
   */
  private async extractJavaScriptDependencies(
    basePath: string,
    content: string,
  ): Promise<string[]> {
    const dependencies: string[] = [];

    const importPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      // Only process relative imports (file dependencies)
      if (importPath.startsWith('.')) {
        const resolvedPath = await this.resolveImportPath(
          basePath,
          importPath,
          ['ts', 'tsx', 'js', 'jsx'],
        );
        if (resolvedPath) {
          dependencies.push(resolvedPath);
        }
      }
    }

    return dependencies;
  }

  /**
   * Extract Python file dependencies
   */
  private async extractPythonDependencies(
    basePath: string,
    content: string,
  ): Promise<string[]> {
    const dependencies: string[] = [];

    // Handle relative imports like "from . import module" or "from .module import something"
    const relativeImportPattern = /^from\s+(\.+\w*)\s+import/gm;
    let match;

    while ((match = relativeImportPattern.exec(content)) !== null) {
      const importPath = match[1];
      const resolvedPath = await this.resolveImportPath(basePath, importPath, [
        'py',
      ]);
      if (resolvedPath) {
        dependencies.push(resolvedPath);
      }
    }

    return dependencies;
  }

  /**
   * Resolve import path to actual file path
   */
  private async resolveImportPath(
    basePath: string,
    importPath: string,
    extensions: string[],
  ): Promise<string | null> {
    let resolvedPath: string;

    if (importPath.startsWith('.')) {
      // Relative import
      resolvedPath = path.resolve(basePath, importPath);
    } else {
      // Module import - not a file dependency
      return null;
    }

    // Try different extensions
    for (const ext of extensions) {
      const filePath = `${resolvedPath}.${ext}`;
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        // File doesn't exist with this extension
      }
    }

    // Try as directory with index file
    for (const ext of extensions) {
      const indexPath = path.join(resolvedPath, `index.${ext}`);
      try {
        await fs.access(indexPath);
        return indexPath;
      } catch {
        // Index file doesn't exist
      }
    }

    return null;
  }
}
