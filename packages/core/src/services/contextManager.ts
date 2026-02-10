/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadJitSubdirectoryMemory,
  concatenateInstructions,
  getGlobalMemoryPaths,
  getExtensionMemoryPaths,
  getEnvironmentMemoryPaths,
  readGeminiMdFiles,
  categorizeAndConcatenate,
  type GeminiFileContent,
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
    const debugMode = this.config.getDebugMode();

    const paths = await this.discoverMemoryPaths(debugMode);
    const contentsMap = await this.loadMemoryContents(paths, debugMode);

    this.categorizeMemoryContents(paths, contentsMap);
    this.emitMemoryChanged();
  }

  private async discoverMemoryPaths(debugMode: boolean) {
    const [global, extension, project] = await Promise.all([
      getGlobalMemoryPaths(debugMode),
      Promise.resolve(
        getExtensionMemoryPaths(this.config.getExtensionLoader()),
      ),
      this.config.isTrustedFolder()
        ? getEnvironmentMemoryPaths(
            [...this.config.getWorkspaceContext().getDirectories()],
            debugMode,
          )
        : Promise.resolve([]),
    ]);

    return { global, extension, project };
  }

  private async loadMemoryContents(
    paths: { global: string[]; extension: string[]; project: string[] },
    debugMode: boolean,
  ) {
    const allPaths = Array.from(
      new Set([...paths.global, ...paths.extension, ...paths.project]),
    );

    const allContents = await readGeminiMdFiles(
      allPaths,
      debugMode,
      this.config.getImportFormat(),
    );

    this.markAsLoaded(
      allContents.filter((c) => c.content !== null).map((c) => c.filePath),
    );

    return new Map(allContents.map((c) => [c.filePath, c]));
  }

  private categorizeMemoryContents(
    paths: { global: string[]; extension: string[]; project: string[] },
    contentsMap: Map<string, GeminiFileContent>,
  ) {
    const workingDir = this.config.getWorkingDir();
    const hierarchicalMemory = categorizeAndConcatenate(
      paths,
      contentsMap,
      workingDir,
    );

    this.globalMemory = hierarchicalMemory.global || '';
    this.extensionMemory = hierarchicalMemory.extension || '';

    const mcpInstructions =
      this.config.getMcpClientManager()?.getMcpInstructions() || '';
    const projectMemoryWithMcp = [
      hierarchicalMemory.project,
      mcpInstructions.trimStart(),
    ]
      .filter(Boolean)
      .join('\n\n');

    this.projectMemory = this.config.isTrustedFolder()
      ? projectMemoryWithMcp
      : '';
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
