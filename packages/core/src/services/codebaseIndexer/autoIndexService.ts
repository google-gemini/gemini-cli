/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CBICodebaseIndexer } from './cbiCodebaseIndexer.js';
import { IndexProgress, IndexResult } from './types.js';
import { Config } from '../../config/config.js';

export interface AutoIndexConfig {
  checkInterval: number;
  enabled: boolean;
  projectRoot: string;
  onProgress?: (progress: IndexProgress) => void;
  onUpdate?: (result: IndexResult) => void;
}

export class AutoIndexService {
  private config: AutoIndexConfig;
  private indexer: CBICodebaseIndexer;
  private intervalId: NodeJS.Timeout | null = null;

  private isRunning = false;

  constructor(config: AutoIndexConfig) {
    this.config = config;
    this.indexer = new CBICodebaseIndexer(config.projectRoot);
  }

  static fromConfig(projectRoot: string, cliConfig: Config, onProgress?: (progress: IndexProgress) => void, onUpdate?: (result: IndexResult) => void): AutoIndexService {
    const config: AutoIndexConfig = {
      checkInterval: cliConfig.getCodebaseIndexingAutoIndexingInterval(),
      enabled: cliConfig.getCodebaseIndexingAutoIndexingEnabled(),
      projectRoot,
      onProgress,
      onUpdate
    };
    
    const service = new AutoIndexService(config);
    service.indexer = CBICodebaseIndexer.fromConfig(projectRoot, cliConfig);
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
      const result = await this.indexer.reindexCodebase(this.config.onProgress);

      this.config.onUpdate?.(result);
    } catch (error) {
      console.warn('Auto-index check failed:', error);
      const errorResult: IndexResult = {
        success: false,
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 },
        totalVectors: 0,
        indexSize: 0,
        duration: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
      this.config.onUpdate?.(errorResult);
    }
  }



  isActive(): boolean {
    return this.isRunning;
  }
}
