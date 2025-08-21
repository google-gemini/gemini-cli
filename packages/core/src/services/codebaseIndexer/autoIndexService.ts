/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodebaseIndexer } from './codebaseIndexer.js';
import { IndexProgress } from './types.js';

export interface AutoIndexConfig {
  checkInterval: number;
  enabled: boolean;
  projectRoot: string;
  onProgress?: (progress: IndexProgress) => void;
  onUpdate?: (result: any) => void;
}

export class AutoIndexService {
  private config: AutoIndexConfig;
  private indexer: CodebaseIndexer;
  private intervalId: NodeJS.Timeout | null = null;
  private lastManifest: any = null;
  private isRunning = false;

  constructor(config: AutoIndexConfig) {
    this.config = config;
    this.indexer = new CodebaseIndexer(config.projectRoot);
  }

  static fromConfig(projectRoot: string, cliConfig: any, onProgress?: (progress: IndexProgress) => void, onUpdate?: (result: any) => void): AutoIndexService {
    const config: AutoIndexConfig = {
      checkInterval: cliConfig.getCodebaseIndexingAutoIndexingInterval(),
      enabled: cliConfig.getCodebaseIndexingAutoIndexingEnabled(),
      projectRoot,
      onProgress,
      onUpdate
    };
    
    const service = new AutoIndexService(config);
    service.indexer = CodebaseIndexer.fromConfig(projectRoot, cliConfig);
    return service;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    const status = await this.indexer.getIndexStatus();
    if (!status.exists) {
      await this.indexer.indexCodebase(this.config.onProgress);
      this.lastManifest = await this.indexer['storage'].loadManifest();
    } else {
      this.lastManifest = await this.indexer['storage'].loadManifest();
    }

    this.intervalId = setInterval(async () => {
      await this.checkForChanges();
    }, this.config.checkInterval);

    await this.checkForChanges();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  private async checkForChanges(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const currentManifest = await this.indexer['storage'].loadManifest();
      
      if (this.hasChanges(currentManifest)) {
        const result = await this.indexer.reindexCodebase(this.config.onProgress);
        
        if (result.success) {
          this.lastManifest = await this.indexer['storage'].loadManifest();
          this.config.onUpdate?.(result);
        }
      }
    } catch (error) {
      console.warn('Auto-index check failed:', error);
    }
  }

  private hasChanges(currentManifest: any): boolean {
    if (!this.lastManifest) {
      return true;
    }

    const lastFileCount = Object.keys(this.lastManifest.files || {}).length;
    const currentFileCount = Object.keys(currentManifest.files || {}).length;

    if (lastFileCount !== currentFileCount) {
      return true;
    }

    for (const [sha, fileInfo] of Object.entries(currentManifest.files || {})) {
      const lastFileInfo = this.lastManifest.files?.[sha];
      if (!lastFileInfo) {
        return true;
      }

      if (lastFileInfo.n !== (fileInfo as any).n) {
        return true;
      }
    }

    return false;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
