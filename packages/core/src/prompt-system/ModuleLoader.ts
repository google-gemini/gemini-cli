/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import type {
  ModuleLoader,
  PromptModule,
} from './interfaces/prompt-assembly.js';

/**
 * Implementation of module loading for prompt assembly system
 */
export class ModuleLoaderImpl implements ModuleLoader {
  private moduleCache = new Map<string, PromptModule>();
  private metadataCache = new Map<string, Omit<PromptModule, 'content'>>();
  private moduleDirectory: string;
  private enableCaching: boolean;

  constructor(
    moduleDirectory: string = path.join(path.dirname(fileURLToPath(import.meta.url))),
    enableCaching: boolean = true,
  ) {
    this.moduleDirectory = moduleDirectory;
    this.enableCaching = enableCaching;
  }

  /**
   * Load a specific module by ID
   */
  async loadModule(id: string): Promise<PromptModule> {
    // Check cache first
    if (this.enableCaching && this.moduleCache.has(id)) {
      return this.moduleCache.get(id)!;
    }

    const module = await this.loadModuleFromDisk(id);

    // Cache the module if caching is enabled
    if (this.enableCaching) {
      this.moduleCache.set(id, module);
    }

    return module;
  }

  /**
   * Load all modules from a specific category
   */
  async loadModulesByCategory(
    category: PromptModule['category'],
  ): Promise<PromptModule[]> {
    const categoryPath = path.join(this.moduleDirectory, category);

    try {
      const files = await fs.readdir(categoryPath);
      const markdownFiles = files.filter((file) => file.endsWith('.md'));

      const modules = await Promise.all(
        markdownFiles.map(async (file) => {
          const moduleId = path.basename(file, '.md');
          return this.loadModule(moduleId);
        }),
      );

      return modules.filter((module) => module.category === category);
    } catch (error) {
      // If category directory doesn't exist, return empty array
      return [];
    }
  }

  /**
   * Load all available modules
   */
  async loadAllModules(): Promise<PromptModule[]> {
    const categories: PromptModule['category'][] = [
      'core',
      'policy',
      'playbook',
      'context',
      'example',
    ];
    const allModules: PromptModule[] = [];

    for (const category of categories) {
      const categoryModules = await this.loadModulesByCategory(category);
      allModules.push(...categoryModules);
    }

    return allModules;
  }

  /**
   * Check if a module exists
   */
  moduleExists(id: string): boolean {
    if (this.enableCaching && this.moduleCache.has(id)) {
      return true;
    }

    // Check all possible locations for the module
    const categories: PromptModule['category'][] = [
      'core',
      'policy',
      'playbook',
      'context',
      'example',
    ];

    for (const category of categories) {
      const filePath = path.join(this.moduleDirectory, category, `${id}.md`);
      try {
        // Use synchronous check for existence
        require('node:fs').accessSync(filePath);
        return true;
      } catch {
        // Continue checking other categories
      }
    }

    return false;
  }

  /**
   * Get module metadata without loading content
   */
  async getModuleMetadata(id: string): Promise<Omit<PromptModule, 'content'>> {
    // Check metadata cache first
    if (this.enableCaching && this.metadataCache.has(id)) {
      return this.metadataCache.get(id)!;
    }

    const module = await this.loadModule(id);
    const metadata = {
      id: module.id,
      version: module.version,
      dependencies: module.dependencies,
      tokenCount: module.tokenCount,
      category: module.category,
      priority: module.priority,
    };

    // Cache metadata if caching is enabled
    if (this.enableCaching) {
      this.metadataCache.set(id, metadata);
    }

    return metadata;
  }

  /**
   * Load a module from disk and parse its metadata
   */
  private async loadModuleFromDisk(id: string): Promise<PromptModule> {
    // Try to find the module in different categories
    const categories: PromptModule['category'][] = [
      'core',
      'policy',
      'playbook',
      'context',
      'example',
    ];

    for (const category of categories) {
      const filePath = path.join(this.moduleDirectory, category, `${id}.md`);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return this.parseModuleContent(id, content, category);
      } catch (error) {
        // Continue trying other categories
      }
    }

    throw new Error(`Module '${id}' not found in any category`);
  }

  /**
   * Parse module content and extract metadata from comments
   */
  private parseModuleContent(
    id: string,
    content: string,
    category: PromptModule['category'],
  ): PromptModule {
    // Extract metadata from HTML comments at the top of the file
    const metadata = this.parseMetadataComments(content);

    // Calculate token count (rough approximation: 1 token ≈ 4 characters)
    const tokenCount = Math.ceil(content.length / 4);

    return {
      id,
      version: metadata.version || '1.0.0',
      content: content.trim(),
      dependencies: metadata.dependencies || [],
      tokenCount: metadata.tokenCount || tokenCount,
      category,
      priority: metadata.priority,
    };
  }

  /**
   * Parse metadata from HTML comments in markdown content
   */
  private parseMetadataComments(content: string): {
    version?: string;
    dependencies?: string[];
    tokenCount?: number;
    priority?: number;
  } {
    const metadata: any = {};

    // Look for HTML comment blocks like:
    // <!--
    // Module: Identity
    // Tokens: ~200 target
    // Dependencies: security
    // Priority: 1
    // -->

    const commentMatch = content.match(/<!--\s*([\s\S]*?)\s*-->/);
    if (commentMatch) {
      const commentContent = commentMatch[1];
      const lines = commentContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Parse Tokens field
        const tokensMatch = trimmedLine.match(/^Tokens:\s*[~]?(\d+)/i);
        if (tokensMatch) {
          metadata.tokenCount = parseInt(tokensMatch[1], 10);
        }

        // Parse Dependencies field
        const dependenciesMatch = trimmedLine.match(/^Dependencies:\s*(.+)/i);
        if (dependenciesMatch) {
          metadata.dependencies = dependenciesMatch[1]
            .split(',')
            .map((dep) => dep.trim())
            .filter((dep) => dep.length > 0);
        }

        // Parse Priority field
        const priorityMatch = trimmedLine.match(/^Priority:\s*(\d+)/i);
        if (priorityMatch) {
          metadata.priority = parseInt(priorityMatch[1], 10);
        }

        // Parse Version field
        const versionMatch = trimmedLine.match(/^Version:\s*(.+)/i);
        if (versionMatch) {
          metadata.version = versionMatch[1].trim();
        }
      }
    }

    return metadata;
  }

  /**
   * Clear all caches (useful for testing and hot-reloading)
   */
  public clearCache(): void {
    this.moduleCache.clear();
    this.metadataCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { modules: number; metadata: number } {
    return {
      modules: this.moduleCache.size,
      metadata: this.metadataCache.size,
    };
  }
}
