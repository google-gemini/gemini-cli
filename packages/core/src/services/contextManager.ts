/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import {
  loadGlobalMemory,
  loadEnvironmentMemory,
  loadJitSubdirectoryMemory,
} from '../utils/memoryDiscovery.js';
import type { ExtensionLoader } from '../utils/extensionLoader.js';
import type { Config } from '../config/config.js';

export class ContextManager {
  private loadedPaths: Set<string> = new Set();
  private config: Config;
  private globalMemory: string = '';
  private environmentMemory: string = '';

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Loads the global memory (Tier 1) and returns the formatted content.
   */
  async loadGlobalMemory(): Promise<string> {
    const result = await loadGlobalMemory(this.config.getDebugMode());
    this.markAsLoaded(result.files.map((f) => f.path));
    this.globalMemory = this.formatMemory(result.files);
    return this.globalMemory;
  }

  /**
   * Loads the environment memory (Tier 2) and returns the formatted content.
   */
  async loadEnvironmentMemory(
    trustedRoots: string[],
    extensionLoader: ExtensionLoader,
  ): Promise<string> {
    const result = await loadEnvironmentMemory(
      trustedRoots,
      extensionLoader,
      this.config.getDebugMode(),
    );
    this.markAsLoaded(result.files.map((f) => f.path));
    this.environmentMemory = this.formatMemory(result.files);
    return this.environmentMemory;
  }

  /**
   * Discovers and loads context for a specific accessed path (Tier 3 - JIT).
   * Traverses upwards from the accessed path to the project root.
   */
  async discoverContext(
    accessedPath: string,
    trustedRoots: string[],
  ): Promise<string> {
    const result = await loadJitSubdirectoryMemory(
      accessedPath,
      trustedRoots,
      this.loadedPaths,
      this.config.getDebugMode(),
    );

    if (result.files.length === 0) {
      return '';
    }

    this.markAsLoaded(result.files.map((f) => f.path));
    return this.formatMemory(result.files);
  }

  getGlobalMemory(): string {
    return this.globalMemory;
  }

  getEnvironmentMemory(): string {
    return this.environmentMemory;
  }

  private markAsLoaded(paths: string[]): void {
    for (const p of paths) {
      this.loadedPaths.add(p);
    }
  }

  private formatMemory(
    files: Array<{ path: string; content: string }>,
  ): string {
    const cwd = this.config.getWorkingDir();
    return files
      .map((file) => {
        const displayPath = path.isAbsolute(file.path)
          ? path.relative(cwd, file.path)
          : file.path;
        return `--- Context from: ${displayPath} ---
${file.content.trim()}
--- End of Context from: ${displayPath} ---`;
      })
      .join('\n\n');
  }

  /**
   * Resets the loaded paths tracking. Useful for testing or full reloads.
   */
  reset(): void {
    this.loadedPaths.clear();
  }

  getLoadedPaths(): Set<string> {
    return this.loadedPaths;
  }
}
