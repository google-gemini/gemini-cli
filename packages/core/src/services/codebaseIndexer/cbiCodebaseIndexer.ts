import * as path from 'path';
import * as fs from 'fs/promises';
import { CodebaseFileDiscoveryService } from './fileDiscoveryService.js';
import { TextProcessor } from './textProcessor.js';
import { EmbeddingService } from './embeddingService.js';
import { CBIIndexStorage } from './cbiIndexStorage.js';
import { 
  IndexConfig, 
  IndexResult, 
  IndexProgress, 
  FileIndex, 
  IndexStatus,
  ScanStats 
} from './types.js';
import { DEFAULT_CONFIG } from './constants.js';

export class CBICodebaseIndexer {
  private readonly config: IndexConfig;
  private readonly fileDiscovery: CodebaseFileDiscoveryService;
  private readonly textProcessor: TextProcessor;
  private readonly embeddingService: EmbeddingService;
  private readonly storage: CBIIndexStorage;
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
    this.storage = new CBIIndexStorage(baseDir);
  }

  static fromConfig(baseDir: string, cliConfig: any): CBICodebaseIndexer {
    const config: Partial<IndexConfig> = {
      embedEndpoint: cliConfig.getCodebaseIndexingEmbedEndpoint(),
      apiKey: cliConfig.getCodebaseIndexingApiKey(),
      batchSize: cliConfig.getCodebaseIndexingBatchSize(),
      maxTextChars: cliConfig.getCodebaseIndexingMaxTextChars(),
      mergeThreshold: cliConfig.getCodebaseIndexingMergeThreshold(),
      skipIfLargerThan: cliConfig.getCodebaseIndexingSkipIfLargerThan(),
    };
    
    return new CBICodebaseIndexer(baseDir, config);
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
        stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 },
        message: '🔍 Scanning files...',
        detail: '0 files found'
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

        if (stats.totalFiles % 5 === 0 || stats.totalFiles === 1) {
          onProgress?.({
            phase: 'scanning',
            processedFiles: 0,
            totalFiles: 0,
            stats,
            message: '🔍 Scanning files...',
            detail: `${stats.totalFiles} files found (${stats.textFiles} text, ${stats.binaryFiles} binary)`
          });
        }
      }

      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats,
        message: '🔍 Scanning complete!',
        detail: `Found ${stats.totalFiles} files (${stats.textFiles} text files)`
      });

      onProgress?.({
        phase: 'processing',
        processedFiles: 0,
        totalFiles: files.length,
        stats,
        message: '📝 Processing files...',
        detail: `0/${files.length} files processed`
      });

      const fileIndices: FileIndex[] = [];
      let totalVectors = 0;

      for (let i = 0; i < files.length; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        const filePath = files[i];
        const relpath = path.relative(this.storage.getBaseDir(), filePath);
        
                      if (i % 2 === 0 || i === files.length - 1) {
          onProgress?.({
            phase: 'processing',
            currentFile: relpath,
            processedFiles: i,
            totalFiles: files.length,
            stats,
            message: '📝 Processing files...',
            detail: `${i + 1}/${files.length} files processed - ${path.basename(relpath)}`
          });
        }

        try {
          const units = await this.textProcessor.processFile(filePath, this.storage.getBaseDir());
          
          if (units.length > 0) {
            const stats = await fs.stat(filePath);
            const fileIndex: FileIndex = {
              sha: await this.generateSha(relpath),
              relpath,
              units,
              embeddings: [],
              mtime: stats.mtime,
              size: stats.size
            };
            
            fileIndices.push(fileIndex);
            totalVectors += units.length;
          }
        } catch (error) {
          console.warn(`Error processing file ${relpath}: ${error}`);
        }
      }

      onProgress?.({
        phase: 'embedding',
        processedFiles: files.length,
        totalFiles: files.length,
        currentBatch: 0,
        totalBatches: Math.ceil(totalVectors / this.config.batchSize),
        totalVectors,
        currentEmbedding: 0,
        totalEmbeddings: totalVectors,
        stats,
        message: '🧠 Generating embeddings...',
        detail: `0/${totalVectors} embeddings generated`
      });

      let processedVectors = 0;
      let processedFiles = 0;
      
      for (const fileIndex of fileIndices) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        processedFiles++;
        onProgress?.({
          phase: 'embedding',
          processedFiles: files.length,
          totalFiles: files.length,
          currentBatch: Math.floor(processedVectors / this.config.batchSize),
          totalBatches: Math.ceil(totalVectors / this.config.batchSize),
          currentVector: processedVectors,
          totalVectors,
          currentEmbedding: processedVectors,
          totalEmbeddings: totalVectors,
          stats,
          message: '🧠 Generating embeddings...',
          detail: `Processing file ${processedFiles}/${fileIndices.length} - ${path.basename(fileIndex.relpath)}`
        });

        const texts = fileIndex.units.map(unit => unit.text);
        const embeddings = await this.embeddingService.getEmbeddings(texts, (current, total) => {
          const currentTotal = processedVectors + current;
          onProgress?.({
            phase: 'embedding',
            processedFiles: files.length,
            totalFiles: files.length,
            currentBatch: Math.floor(currentTotal / this.config.batchSize),
            totalBatches: Math.ceil(totalVectors / this.config.batchSize),
            currentVector: currentTotal,
            totalVectors,
            currentEmbedding: currentTotal,
            totalEmbeddings: totalVectors,
            stats,
            message: '🧠 Generating embeddings...',
            detail: `${currentTotal}/${totalVectors} embeddings generated (${current}/${total} in current file)`
          });
        });
        
        if (embeddings && embeddings.length === texts.length) {
          fileIndex.embeddings = embeddings;
          processedVectors += embeddings.length;
        } else {
          console.warn(`Failed to generate embeddings for ${fileIndex.relpath}`);
        }
      }

      onProgress?.({
        phase: 'building_index',
        processedFiles: files.length,
        totalFiles: files.length,
        totalVectors,
        stats,
        message: '🔗 Building HNSW index...',
        detail: `0/${totalVectors} vectors processed`
      });

      await this.storage.saveIndex(fileIndices, (current, total) => {
        onProgress?.({
          phase: 'building_index',
          processedFiles: files.length,
          totalFiles: files.length,
          currentVector: current,
          totalVectors: total,
          stats,
          message: '🔗 Building HNSW index...',
          detail: `${current}/${total} vectors processed`
        });
      });

      onProgress?.({
        phase: 'saving',
        processedFiles: files.length,
        totalFiles: files.length,
        stats,
        message: '💾 Saving index...',
        detail: 'Writing to disk...'
      });

      const duration = Date.now() - startTime;
      const indexSize = await this.getIndexSize();

      onProgress?.({
        phase: 'complete',
        processedFiles: files.length,
        totalFiles: files.length,
        stats,
        message: '✅ Indexing complete!',
        detail: `Indexed ${files.length} files with ${totalVectors} vectors`
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
    await this.storage.deleteIndex();
    return this.indexCodebase(onProgress);
  }

  async deleteIndex(): Promise<void> {
    await this.storage.deleteIndex();
  }

  async getIndexStatus(): Promise<IndexStatus> {
    return this.storage.getIndexStatus();
  }

  async validateIndex(): Promise<{ valid: boolean; errors: string[] }> {
    return this.storage.validateIndexIntegrity();
  }

  abortIndexing(): void {
    this.abortController?.abort();
  }

  private async generateSha(relpath: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(relpath).digest('hex').substring(0, 12);
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

    const searchResults = await this.storage.searchWithHNSW(queryVector, topk);

    if (searchResults.length === 0) {
      return [];
    }

    const results = [];
    for (const { score, metadata: meta } of searchResults) {
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
}
