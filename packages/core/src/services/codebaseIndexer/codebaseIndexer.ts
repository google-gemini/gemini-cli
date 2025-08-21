/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { CodebaseFileDiscoveryService } from './fileDiscoveryService.js';
import { TextProcessor } from './textProcessor.js';
import { EmbeddingService } from './embeddingService.js';
import { IndexStorage } from './indexStorage.js';
import { 
  IndexConfig, 
  IndexResult, 
  IndexProgress, 
  FileIndex, 
  IndexStatus,
  ScanStats 
} from './types.js';
import { DEFAULT_CONFIG } from './constants.js';

export class CodebaseIndexer {
  private readonly config: IndexConfig;
  private readonly fileDiscovery: CodebaseFileDiscoveryService;
  private readonly textProcessor: TextProcessor;
  private readonly embeddingService: EmbeddingService;
  private readonly storage: IndexStorage;
  private abortController: AbortController | null = null;

  constructor(baseDir: string, config: Partial<IndexConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fileDiscovery = new CodebaseFileDiscoveryService(this.config.skipIfLargerThan);
    this.textProcessor = new TextProcessor(this.config.maxTextChars, this.config.mergeThreshold);
    this.embeddingService = new EmbeddingService({
      endpoint: this.config.embedEndpoint,
      apiKey: this.config.apiKey,
      batchSize: this.config.batchSize
    });
    this.storage = new IndexStorage(baseDir);
  }

  static fromConfig(baseDir: string, cliConfig: any): CodebaseIndexer {
    const config: Partial<IndexConfig> = {
      embedEndpoint: cliConfig.getCodebaseIndexingEmbedEndpoint(),
      apiKey: cliConfig.getCodebaseIndexingApiKey(),
      batchSize: cliConfig.getCodebaseIndexingBatchSize(),
      maxTextChars: cliConfig.getCodebaseIndexingMaxTextChars(),
      mergeThreshold: cliConfig.getCodebaseIndexingMergeThreshold(),
      skipIfLargerThan: cliConfig.getCodebaseIndexingSkipIfLargerThan(),
    };
    
    return new CodebaseIndexer(baseDir, config);
  }

  async indexCodebase(
    onProgress?: (progress: IndexProgress) => void
  ): Promise<IndexResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();
    
    try {
      if (await this.storage.indexExists()) {
        await this.storage.deleteIndex();
      }
      await this.storage.createIndexDirectory();

      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 }
      });

      const files: string[] = [];
      const stats: ScanStats = {
        totalFiles: 0,
        textFiles: 0,
        binaryFiles: 0,
        largeFiles: 0,
        excludedFiles: 0
      };

      for await (const fileInfo of this.fileDiscovery.scanDirectory(this.storage.getBaseDir())) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        stats.totalFiles++;
        if (fileInfo.isText) {
          stats.textFiles++;
          files.push(fileInfo.path);
        } else {
          stats.binaryFiles++;
        }

        if (fileInfo.size > this.config.skipIfLargerThan) {
          stats.largeFiles++;
        }
      }

      onProgress?.({
        phase: 'processing',
        processedFiles: 0,
        totalFiles: files.length,
        stats
      });

      const fileIndices: FileIndex[] = [];
      let processedFiles = 0;
      let totalVectors = 0;

      for (const filePath of files) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        const relpath = path.relative(this.storage.getBaseDir(), filePath).replace(/\\/g, '/');
        
        if (await this.storage.fileIndexExists(relpath)) {
          processedFiles++;
          onProgress?.({
            phase: 'processing',
            currentFile: relpath,
            processedFiles,
            totalFiles: files.length,
            stats
          });
          continue;
        }

        const units = await this.textProcessor.processFile(filePath, this.storage.getBaseDir());
        if (units.length === 0) {
          processedFiles++;
          continue;
        }

        onProgress?.({
          phase: 'embedding',
          currentFile: relpath,
          processedFiles,
          totalFiles: files.length,
          stats
        });

        const texts = units.map(unit => unit.text);
        const embeddings = await this.embeddingService.generateEmbeddings(texts);

        if (embeddings.length !== units.length) {
          throw new Error(`Embeddings count mismatch for file ${relpath}`);
        }

        const fileIndex: FileIndex = {
          sha: await this.generateSha(relpath),
          relpath,
          units,
          embeddings,
          mtime: new Date(),
          size: 0
        };

        await this.storage.saveFileIndex(fileIndex);
        fileIndices.push(fileIndex);
        totalVectors += units.length;
        processedFiles++;

        onProgress?.({
          phase: 'saving',
          currentFile: relpath,
          processedFiles,
          totalFiles: files.length,
          stats
        });
      }

      const manifestFiles: Record<string, any> = {};
      for (const fileIndex of fileIndices) {
        manifestFiles[fileIndex.sha] = {
          relpath: fileIndex.relpath,
          meta: `${fileIndex.sha}.meta.jsonl`,
          vec: `${fileIndex.sha}.bin`,
          n: fileIndex.units.length
        };
      }

      await this.storage.saveManifest(manifestFiles, totalVectors);

      const duration = Date.now() - startTime;
      const indexSize = await this.getIndexSize();

      onProgress?.({
        phase: 'complete',
        processedFiles,
        totalFiles: files.length,
        stats
      });

      return {
        success: true,
        stats,
        totalVectors,
        indexSize,
        duration,
        errors: []
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 },
        totalVectors: 0,
        indexSize: 0,
        duration,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  async reindexCodebase(
    onProgress?: (progress: IndexProgress) => void
  ): Promise<IndexResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();
    
    try {
      if (!(await this.storage.indexExists())) {
        return this.indexCodebase(onProgress);
      }

      const existingManifest = await this.storage.loadManifest();
      const existingFiles = new Set(Object.keys(existingManifest.files || {}));
      
      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 }
      });

      const files: string[] = [];
      const stats: ScanStats = {
        totalFiles: 0,
        textFiles: 0,
        binaryFiles: 0,
        largeFiles: 0,
        excludedFiles: 0
      };

      for await (const fileInfo of this.fileDiscovery.scanDirectory(this.storage.getBaseDir())) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        stats.totalFiles++;
        if (fileInfo.isText) {
          stats.textFiles++;
          files.push(fileInfo.path);
        } else {
          stats.binaryFiles++;
        }

        if (fileInfo.size > this.config.skipIfLargerThan) {
          stats.largeFiles++;
        }
      }

      const newOrModifiedFiles: string[] = [];
      const existingFileIndices: FileIndex[] = [];
      let existingVectors = 0;
      const currentFileShas = new Set<string>();

      const reindexStats: ScanStats = {
        totalFiles: 0,
        textFiles: 0,
        binaryFiles: 0,
        largeFiles: 0,
        excludedFiles: 0
      };

      for (const filePath of files) {
        const relpath = path.relative(this.storage.getBaseDir(), filePath).replace(/\\/g, '/');
        const sha = await this.generateSha(relpath);
        currentFileShas.add(sha);
        
        if (existingFiles.has(sha)) {
          const existingFileIndex = await this.storage.loadFileIndex(relpath);
          if (existingFileIndex) {
            const fileStats = await fs.stat(filePath);
            const timeDiff = fileStats.mtime.getTime() - existingFileIndex.mtime.getTime();
            if (timeDiff > 1000) {
              newOrModifiedFiles.push(filePath);
              reindexStats.totalFiles++;
              reindexStats.textFiles++;
            } else {
              existingFileIndices.push(existingFileIndex);
              existingVectors += existingFileIndex.units.length;
            }
          }
        } else {
          newOrModifiedFiles.push(filePath);
          reindexStats.totalFiles++;
          reindexStats.textFiles++;
        }
      }

      const deletedFiles: string[] = [];
      for (const [sha, fileInfo] of Object.entries(existingManifest.files || {})) {
        if (!currentFileShas.has(sha)) {
          deletedFiles.push(sha);
          const fileInfoTyped = fileInfo as { relpath: string; n: number };
          existingVectors -= fileInfoTyped.n;
        }
      }

      onProgress?.({
        phase: 'processing',
        processedFiles: 0,
        totalFiles: newOrModifiedFiles.length,
        stats: reindexStats
      });

      const fileIndices: FileIndex[] = [];
      let processedFiles = 0;
      let newVectors = 0;

      for (const filePath of newOrModifiedFiles) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        const relpath = path.relative(this.storage.getBaseDir(), filePath).replace(/\\/g, '/');
        
        const units = await this.textProcessor.processFile(filePath, this.storage.getBaseDir());
        if (units.length === 0) {
          processedFiles++;
          continue;
        }

        onProgress?.({
          phase: 'embedding',
          currentFile: relpath,
          processedFiles,
          totalFiles: newOrModifiedFiles.length,
          stats: reindexStats
        });

        const texts = units.map(unit => unit.text);
        const embeddings = await this.embeddingService.generateEmbeddings(texts);

        if (embeddings.length !== units.length) {
          throw new Error(`Embeddings count mismatch for file ${relpath}`);
        }

        const fileStats = await fs.stat(filePath);
        
        const fileIndex: FileIndex = {
          sha: await this.generateSha(relpath),
          relpath,
          units,
          embeddings,
          mtime: fileStats.mtime,
          size: fileStats.size
        };

        await this.storage.saveFileIndex(fileIndex);
        fileIndices.push(fileIndex);
        newVectors += units.length;
        processedFiles++;

        onProgress?.({
          phase: 'saving',
          currentFile: relpath,
          processedFiles,
          totalFiles: newOrModifiedFiles.length,
          stats: reindexStats
        });
      }

      const allFileIndices = [...existingFileIndices, ...fileIndices];

      const manifestFiles: Record<string, any> = {};
      for (const fileIndex of allFileIndices) {
        manifestFiles[fileIndex.sha] = {
          relpath: fileIndex.relpath,
          meta: `${fileIndex.sha}.meta.jsonl`,
          vec: `${fileIndex.sha}.bin`,
          n: fileIndex.units.length
        };
      }

      for (const deletedSha of deletedFiles) {
        delete manifestFiles[deletedSha];
      }

      const totalVectors = existingVectors + newVectors;
      await this.storage.saveManifest(manifestFiles, totalVectors);

      const duration = Date.now() - startTime;
      const indexSize = await this.getIndexSize();

      onProgress?.({
        phase: 'complete',
        processedFiles,
        totalFiles: newOrModifiedFiles.length,
        stats: reindexStats
      });

      return {
        success: true,
        stats: reindexStats,
        totalVectors: newVectors,
        indexSize,
        duration,
        errors: [],
        isReindex: true
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 },
        totalVectors: 0,
        indexSize: 0,
        duration,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  async getIndexStatus(): Promise<IndexStatus> {
    return this.storage.getIndexStatus();
  }

  async loadManifest(): Promise<any> {
    return this.storage.loadManifest();
  }

  async deleteIndex(): Promise<void> {
    await this.storage.deleteIndex();
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private async generateSha(relpath: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha1').update(relpath).digest('hex');
  }

  private async getIndexSize(): Promise<number> {
    const status = await this.storage.getIndexStatus();
    return status.sizeBytes || 0;
  }

  async search(
    query: string,
    topk: number = 8,
    contextLines: number = 2
  ): Promise<Array<{
    score: number;
    file: string;
    start_line: number;
    end_line: number;
    text: string;
    context: string;
  }>> {
    const status = await this.storage.getIndexStatus();
    if (!status.exists) {
      throw new Error('Index does not exist. Please run indexing first.');
    }

    const queryEmbeddings = await this.embeddingService.getEmbeddings([query]);
    if (!queryEmbeddings || queryEmbeddings.length === 0) {
      throw new Error('Failed to generate embeddings for query');
    }

    const queryVector = queryEmbeddings[0];

    const { vectors, metadata } = await this.storage.loadAllVectors();

    if (vectors.length === 0) {
      return [];
    }

    const similarities = vectors.map((vector: number[], index: number) => ({
      score: this.cosineSimilarity(queryVector, vector),
      index
    }));

    similarities.sort((a, b) => b.score - a.score);
    const topResults = similarities.slice(0, topk);

    const results = [];
    for (const { score, index } of topResults) {
      const meta = metadata[index];
      const filePath = path.join(this.storage.getBaseDir(), meta.relpath);
      
      let context = '';
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        const lineNumber = meta.lineno || meta.start_lineno || 1;
        const start = Math.max(0, lineNumber - 1 - contextLines);
        const end = Math.min(lines.length, lineNumber + contextLines);
        context = lines.slice(start, end).join('\n');
      } catch (error) {
        context = meta.text || '';
      }

      results.push({
        score,
        file: filePath,
        start_line: meta.lineno || meta.start_lineno || 1,
        end_line: meta.lineno || meta.end_lineno || 1,
        text: meta.text,
        context
      });
    }

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
}
