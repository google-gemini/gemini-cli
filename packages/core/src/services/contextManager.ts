/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadGlobalMemory,
  loadExtensionMemory,
  loadEnvironmentMemory,
  loadJitSubdirectoryMemory,
  concatenateInstructions,
} from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import { coreEvents, CoreEvent } from '../utils/events.js';

export class ContextManager {
  private readonly loadedPaths: Set<string> = new Set();
  private readonly config: Config;
  private globalMemory: string = '';
  private extensionMemory: string = '';
  private projectMemory: string = '';

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Refreshes the memory by reloading global, extension, and project memory.
   */
  async refresh(): Promise<void> {
    this.loadedPaths.clear();
    await this.loadGlobalMemory();
    await this.loadExtensionMemory();
    await this.loadProjectMemory();
    this.emitMemoryChanged();
  }

  private async loadGlobalMemory(): Promise<void> {
    const result = await loadGlobalMemory(this.config.getDebugMode());
    this.markAsLoaded(result.files.map((f) => f.path));
    this.globalMemory = concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
  }

  private async loadExtensionMemory(): Promise<void> {
    const result = await loadExtensionMemory(
      this.config.getExtensionLoader(),
      this.config.getDebugMode(),
    );
    this.markAsLoaded(result.files.map((f) => f.path));
    this.extensionMemory = concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
  }

  private async loadProjectMemory(): Promise<void> {
    if (!this.config.isTrustedFolder()) {
      this.projectMemory = '';
      return;
    }
    const result = await loadEnvironmentMemory(
      [...this.config.getWorkspaceContext().getDirectories()],
      this.config.getDebugMode(),
    );

    this.markAsLoaded(result.files.map((f) => f.path));
    const projectMemory = concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
    const mcpInstructions =
      this.config.getMcpClientManager()?.getMcpInstructions() || '';
    this.projectMemory = [projectMemory, mcpInstructions.trimStart()]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Discovers and loads context for a specific accessed path (Tier 3 - JIT).
   * Traverses upwards from the accessed path to the project root.
   */
  async discoverContext(
    accessedPath: string,
    trustedRoots: string[],
  ): Promise<string> {
    if (!this.config.isTrustedFolder()) {
      return '';
    }
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

  private emitMemoryChanged(): void {
    coreEvents.emit(CoreEvent.MemoryChanged, {
      fileCount: this.loadedPaths.size,
    });
  }

  getGlobalMemory(): string {
    return this.globalMemory;
  }

  getExtensionMemory(): string {
    return this.extensionMemory;
  }

  getEnvironmentMemory(): string {
    return this.projectMemory;
  }

  private markAsLoaded(paths: string[]): void {
    paths.forEach((p) => this.loadedPaths.add(p));
  }

  getLoadedPaths(): ReadonlySet<string> {
    return this.loadedPaths;
  }
}
