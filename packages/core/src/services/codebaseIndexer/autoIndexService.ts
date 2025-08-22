/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CBICodebaseIndexer } from './cbiCodebaseIndexer.js';
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
  private indexer: CBICodebaseIndexer;
  private intervalId: NodeJS.Timeout | null = null;

  private isRunning = false;

  constructor(config: AutoIndexConfig) {
    this.config = config;
    this.indexer = new CBICodebaseIndexer(config.projectRoot);
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

      if (result.success) {
        this.config.onUpdate?.(result);
      }
    } catch (error) {
      console.warn('Auto-index check failed:', error);
    }
  }



  isActive(): boolean {
    return this.isRunning;
  }
}
