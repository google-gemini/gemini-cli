/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadGlobalMemory,
  loadEnvironmentMemory,
  loadJitSubdirectoryMemory,
  concatenateInstructions,
} from '../utils/memoryDiscovery.js';
import type { ExtensionLoader } from '../utils/extensionLoader.js';
import type { Config } from '../config/config.js';

export class ContextManager {
  private readonly loadedPaths: Set<string> = new Set();
  private readonly config: Config;
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
    this.globalMemory = concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
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
    this.environmentMemory = concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
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
    return concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
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

  /**
   * Resets the loaded paths tracking and memory. Useful for testing or full reloads.
   */
  reset(): void {
    this.loadedPaths.clear();
    this.globalMemory = '';
    this.environmentMemory = '';
  }

  getLoadedPaths(): ReadonlySet<string> {
    return this.loadedPaths;
  }
}
