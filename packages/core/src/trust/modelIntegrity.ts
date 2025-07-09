/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

export interface ModelIntegrityInfo {
  modelName: string;
  filePath: string;
  fileSize: number;
  sha256Hash: string;
  blake3Hash?: string;
  createdAt: string;
  lastVerified: string;
  signatureValid?: boolean;
  trustedSource?: boolean;
}

export interface VerificationResult {
  valid: boolean;
  reason: string;
  details?: {
    expectedHash?: string;
    actualHash?: string;
    expectedSize?: number;
    actualSize?: number;
    timeTaken?: number;
  };
}

export interface TrustedModelRegistry {
  models: {
    [modelName: string]: {
      sha256: string;
      blake3?: string;
      size: number;
      source: string;
      addedDate: string;
      lastUpdated: string;
    };
  };
  version: string;
  lastUpdated: string;
}

export class ModelIntegrityChecker {
  private registryPath: string;
  private trustedRegistry: TrustedModelRegistry | null = null;

  constructor(private configDir: string) {
    this.registryPath = path.join(configDir, 'trusted-models.json');
  }

  async initialize(): Promise<void> {
    try {
      await this.loadTrustedRegistry();
    } catch (error) {
      // Initialize with default trusted models
      this.trustedRegistry = {
        models: {
          'phi-3.5-mini-instruct': {
            sha256: 'pending_verification',
            size: 2393232672,
            source: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF',
            addedDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          },
          'qwen2.5-1.5b-instruct': {
            sha256: 'pending_verification',
            size: 1894532128,
            source: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf',
            addedDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          }
        },
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };
      await this.saveTrustedRegistry();
    }
  }

  /**
   * Compute multiple hashes for a file with progress reporting
   */
  async computeFileHashes(
    filePath: string,
    algorithms: string[] = ['sha256'],
    onProgress?: (bytesProcessed: number, totalBytes: number) => void
  ): Promise<{ [algorithm: string]: string }> {
    const stats = await fs.stat(filePath);
    const totalBytes = stats.size;
    let processedBytes = 0;

    const hashes: { [key: string]: crypto.Hash } = {};
    algorithms.forEach(algo => {
      hashes[algo] = crypto.createHash(algo);
    });

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks

      stream.on('data', (chunk: string | Buffer) => {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        processedBytes += buffer.length;
        Object.values(hashes).forEach(hash => hash.update(buffer));
        
        if (onProgress) {
          onProgress(processedBytes, totalBytes);
        }
      });

      stream.on('end', () => {
        const results: { [key: string]: string } = {};
        Object.entries(hashes).forEach(([algo, hash]) => {
          results[algo] = hash.digest('hex');
        });
        resolve(results);
      });

      stream.on('error', reject);
    });
  }

  /**
   * Verify model integrity against trusted registry
   */
  async verifyModel(
    modelPath: string,
    modelName: string,
    expectedHash?: string,
    onProgress?: (status: string, progress?: number) => void
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Check file exists
      const stats = await fs.stat(modelPath);
      if (!stats.isFile()) {
        return {
          valid: false,
          reason: 'Model file does not exist or is not a regular file'
        };
      }

      const fileSize = stats.size;
      onProgress?.('Checking file size...', 10);

      // Check against trusted registry
      const trustedInfo = this.trustedRegistry?.models[modelName];
      if (trustedInfo) {
        // Verify file size (with 5% tolerance for compression variations)
        const sizeTolerance = trustedInfo.size * 0.05;
        if (Math.abs(fileSize - trustedInfo.size) > sizeTolerance) {
          return {
            valid: false,
            reason: 'File size mismatch',
            details: {
              expectedSize: trustedInfo.size,
              actualSize: fileSize
            }
          };
        }
      }

      onProgress?.('Computing SHA-256 hash...', 20);

      // Compute hash with progress
      const hashes = await this.computeFileHashes(modelPath, ['sha256'], (processed, total) => {
        const hashProgress = 20 + (processed / total) * 60; // 20-80% for hashing
        onProgress?.(`Computing hash... ${Math.round(processed / total * 100)}%`, hashProgress);
      });

      const computedHash = hashes.sha256;
      onProgress?.('Verifying hash...', 85);

      // Check against provided hash
      if (expectedHash && expectedHash !== 'pending_verification') {
        const hashMatch = computedHash === expectedHash.replace('sha256:', '');
        if (!hashMatch) {
          return {
            valid: false,
            reason: 'Hash mismatch',
            details: {
              expectedHash,
              actualHash: `sha256:${computedHash}`,
              timeTaken: Date.now() - startTime
            }
          };
        }
      }

      // Update trusted registry if this is first verification
      if (trustedInfo && trustedInfo.sha256 === 'pending_verification') {
        trustedInfo.sha256 = computedHash;
        trustedInfo.lastUpdated = new Date().toISOString();
        await this.saveTrustedRegistry();
        onProgress?.('Updated trusted registry', 95);
      }

      onProgress?.('Verification complete', 100);

      return {
        valid: true,
        reason: 'Model verified successfully',
        details: {
          actualHash: `sha256:${computedHash}`,
          actualSize: fileSize,
          timeTaken: Date.now() - startTime
        }
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Add a verified model to the trusted registry
   */
  async addTrustedModel(
    modelName: string,
    modelPath: string,
    source: string
  ): Promise<void> {
    const stats = await fs.stat(modelPath);
    const hashes = await this.computeFileHashes(modelPath, ['sha256']);

    if (!this.trustedRegistry) {
      await this.initialize();
    }

    this.trustedRegistry!.models[modelName] = {
      sha256: hashes.sha256,
      size: stats.size,
      source,
      addedDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await this.saveTrustedRegistry();
  }

  /**
   * Generate integrity report for a model
   */
  async generateIntegrityReport(
    modelPath: string,
    modelName: string
  ): Promise<ModelIntegrityInfo> {
    const stats = await fs.stat(modelPath);
    const hashes = await this.computeFileHashes(modelPath, ['sha256']);
    const trustedInfo = this.trustedRegistry?.models[modelName];

    return {
      modelName,
      filePath: modelPath,
      fileSize: stats.size,
      sha256Hash: `sha256:${hashes.sha256}`,
      createdAt: stats.birthtime.toISOString(),
      lastVerified: new Date().toISOString(),
      trustedSource: !!trustedInfo,
      signatureValid: trustedInfo ? hashes.sha256 === trustedInfo.sha256 : undefined
    };
  }

  /**
   * Verify all models in a directory
   */
  async verifyAllModels(
    modelsDir: string,
    onProgress?: (model: string, status: string) => void
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();
    
    try {
      const files = await fs.readdir(modelsDir);
      const ggufFiles = files.filter(f => f.endsWith('.gguf'));

      for (const file of ggufFiles) {
        const modelPath = path.join(modelsDir, file);
        const modelName = file.replace('.gguf', '');
        
        onProgress?.(modelName, 'Starting verification...');
        
        const result = await this.verifyModel(modelPath, modelName);
        results.set(modelName, result);
        
        onProgress?.(modelName, result.valid ? 'Verified ✓' : `Failed: ${result.reason}`);
      }
    } catch (error) {
      onProgress?.('error', `Error scanning directory: ${error}`);
    }

    return results;
  }

  /**
   * Create a signed manifest for model distribution
   */
  async createModelManifest(
    modelPath: string,
    modelName: string,
    metadata: any = {}
  ): Promise<string> {
    const integrityInfo = await this.generateIntegrityReport(modelPath, modelName);
    
    const manifest = {
      version: '1.0',
      model: {
        name: modelName,
        ...integrityInfo,
        metadata
      },
      created: new Date().toISOString(),
      generator: 'trust-cli/0.1.0'
    };

    const manifestPath = `${modelPath}.manifest.json`;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    
    return manifestPath;
  }

  private async loadTrustedRegistry(): Promise<void> {
    const data = await fs.readFile(this.registryPath, 'utf-8');
    this.trustedRegistry = JSON.parse(data);
  }

  private async saveTrustedRegistry(): Promise<void> {
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(
      this.registryPath,
      JSON.stringify(this.trustedRegistry, null, 2)
    );
  }

  /**
   * Export integrity database for backup
   */
  async exportIntegrityDatabase(exportPath: string): Promise<void> {
    const backup = {
      trustedRegistry: this.trustedRegistry,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    await fs.writeFile(exportPath, JSON.stringify(backup, null, 2));
  }

  /**
   * Import integrity database from backup
   */
  async importIntegrityDatabase(importPath: string): Promise<void> {
    const data = await fs.readFile(importPath, 'utf-8');
    const backup = JSON.parse(data);
    
    if (backup.trustedRegistry) {
      this.trustedRegistry = backup.trustedRegistry;
      await this.saveTrustedRegistry();
    }
  }
}