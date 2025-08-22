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
import { Config } from '../../config/config.js';

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

  static fromConfig(baseDir: string, cliConfig: Config): CBICodebaseIndexer {
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
    const errors: string[] = [];
    const stats: ScanStats = {
      totalFiles: 0,
      textFiles: 0,
      binaryFiles: 0,
      largeFiles: 0,
      excludedFiles: 0
    };
    
    try {
      if (await this.storage.indexExists()) {
        await this.storage.deleteIndex();
      }
      await this.storage.createIndexDirectory();

      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats,
        message: '🔍 Scanning files...',
        detail: '0 files found'
      });

      const files: string[] = [];

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
          const errorMessage = `Error processing file ${relpath}: ${error}`;
          console.warn(errorMessage);
          errors.push(errorMessage);
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
          const errorMessage = `Failed to generate embeddings for ${fileIndex.relpath}`;
          console.warn(errorMessage);
          errors.push(errorMessage);
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
        errors
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        stats,
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
    const errors: string[] = [];
    const stats: ScanStats = {
      totalFiles: 0,
      textFiles: 0,
      binaryFiles: 0,
      largeFiles: 0,
      excludedFiles: 0
    };
    
    try {
      if (!(await this.storage.indexExists())) {
        return this.indexCodebase(onProgress);
      }

      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats,
        message: '🔍 Scanning files for changes...',
        detail: 'Loading existing index metadata...'
      });

      const existingMetadata = await this.storage.loadFileMetadata();
      
      onProgress?.({
        phase: 'scanning',
        processedFiles: 0,
        totalFiles: 0,
        stats,
        message: '🔍 Scanning current files...',
        detail: `Found ${existingMetadata.size} files in existing index`
      });

      const currentFiles: string[] = [];

      for await (const fileInfo of this.fileDiscovery.scanDirectory(this.storage.getBaseDir())) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        stats.totalFiles++;
        if (fileInfo.isText) {
          stats.textFiles++;
          currentFiles.push(fileInfo.path);
        } else {
          stats.binaryFiles++;
        }

        if (fileInfo.size > this.config.skipIfLargerThan) {
          stats.largeFiles++;
        }

        if (stats.totalFiles % 10 === 0 || stats.totalFiles === 1) {
          onProgress?.({
            phase: 'scanning',
            processedFiles: 0,
            totalFiles: 0,
            stats,
            message: '🔍 Scanning current files...',
            detail: `${stats.totalFiles} files found (${stats.textFiles} text, ${stats.binaryFiles} binary)`
          });
        }
      }

      onProgress?.({
        phase: 'processing',
        processedFiles: 0,
        totalFiles: currentFiles.length,
        stats,
        message: '📝 Comparing files...',
        detail: 'Detecting changes...'
      });

      const newFileIndices: FileIndex[] = [];
      const removedFilePaths: string[] = [];
      let addedFiles = 0;
      let modifiedFiles = 0;
      let unchangedFiles = 0;

      const currentFilePaths = new Set(currentFiles.map(f => path.relative(this.storage.getBaseDir(), f)));
      
      for (const [existingPath] of existingMetadata) {
        if (!currentFilePaths.has(existingPath)) {
          removedFilePaths.push(existingPath);
        }
      }

      for (let i = 0; i < currentFiles.length; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Indexing cancelled');
        }

        const filePath = currentFiles[i];
        const relpath = path.relative(this.storage.getBaseDir(), filePath);
        
        if (i % 5 === 0 || i === currentFiles.length - 1) {
          onProgress?.({
            phase: 'processing',
            currentFile: relpath,
            processedFiles: i,
            totalFiles: currentFiles.length,
            stats,
            message: '📝 Comparing files...',
            detail: `${i + 1}/${currentFiles.length} - ${addedFiles} new, ${modifiedFiles} modified, ${unchangedFiles} unchanged`
          });
        }

        try {
          const fileStats = await fs.stat(filePath);
          const existingMeta = existingMetadata.get(relpath);
          
          const needsUpdate = !existingMeta || 
            existingMeta.mtime !== Math.floor(fileStats.mtime.getTime() / 1000) ||
            existingMeta.size !== fileStats.size;

          if (needsUpdate) {
            const units = await this.textProcessor.processFile(filePath, this.storage.getBaseDir());
            
            if (units.length > 0) {
              const fileIndex: FileIndex = {
                sha: await this.generateSha(relpath),
                relpath,
                units,
                embeddings: [],
                mtime: fileStats.mtime,
                size: fileStats.size
              };
              
              newFileIndices.push(fileIndex);
              if (existingMeta) {
                modifiedFiles++;
              } else {
                addedFiles++;
              }
            }
          } else {
            unchangedFiles++;
          }
        } catch (error) {
          const errorMessage = `Error processing file ${relpath}: ${error}`;
          console.warn(errorMessage);
          errors.push(errorMessage);
        }
      }

      const totalChanges = newFileIndices.length + removedFilePaths.length;
      
      if (totalChanges === 0) {
        onProgress?.({
          phase: 'complete',
          processedFiles: currentFiles.length,
          totalFiles: currentFiles.length,
          stats,
          message: '✅ No changes detected!',
          detail: `All ${unchangedFiles} files are up to date`
        });

        return {
          success: true,
          stats,
          totalVectors: 0,
          indexSize: await this.getIndexSize(),
          duration: Date.now() - startTime,
          errors
        };
      }

      onProgress?.({
        phase: 'processing',
        processedFiles: currentFiles.length,
        totalFiles: currentFiles.length,
        stats,
        message: '📝 Analysis complete!',
        detail: `Changes: ${addedFiles} new, ${modifiedFiles} modified, ${removedFilePaths.length} removed`
      });

      if (newFileIndices.length > 0) {
        const totalVectors = newFileIndices.reduce((sum, fi) => sum + fi.units.length, 0);
        
        onProgress?.({
          phase: 'embedding',
          processedFiles: currentFiles.length,
          totalFiles: currentFiles.length,
          currentBatch: 0,
          totalBatches: Math.ceil(totalVectors / this.config.batchSize),
          totalVectors,
          currentEmbedding: 0,
          totalEmbeddings: totalVectors,
          stats,
          message: '🧠 Generating embeddings for changed files...',
          detail: `0/${totalVectors} embeddings generated`
        });

        let processedVectors = 0;
        let processedFiles = 0;
        
        for (const fileIndex of newFileIndices) {
          if (this.abortController.signal.aborted) {
            throw new Error('Indexing cancelled');
          }

          processedFiles++;
          onProgress?.({
            phase: 'embedding',
            processedFiles: currentFiles.length,
            totalFiles: currentFiles.length,
            currentBatch: Math.floor(processedVectors / this.config.batchSize),
            totalBatches: Math.ceil(totalVectors / this.config.batchSize),
            currentVector: processedVectors,
            totalVectors,
            currentEmbedding: processedVectors,
            totalEmbeddings: totalVectors,
            stats,
            message: '🧠 Generating embeddings for changed files...',
            detail: `Processing file ${processedFiles}/${newFileIndices.length} - ${path.basename(fileIndex.relpath)}`
          });

          const texts = fileIndex.units.map(unit => unit.text);
          const embeddings = await this.embeddingService.getEmbeddings(texts, (current, total) => {
            const currentTotal = processedVectors + current;
            onProgress?.({
              phase: 'embedding',
              processedFiles: currentFiles.length,
              totalFiles: currentFiles.length,
              currentBatch: Math.floor(currentTotal / this.config.batchSize),
              totalBatches: Math.ceil(totalVectors / this.config.batchSize),
              currentVector: currentTotal,
              totalVectors,
              currentEmbedding: currentTotal,
              totalEmbeddings: totalVectors,
              stats,
              message: '🧠 Generating embeddings for changed files...',
              detail: `${currentTotal}/${totalVectors} embeddings generated (${current}/${total} in current file)`
            });
          });
          
          if (embeddings && embeddings.length === texts.length) {
            fileIndex.embeddings = embeddings;
            processedVectors += embeddings.length;
          } else {
            const errorMessage = `Failed to generate embeddings for ${fileIndex.relpath}`;
            console.warn(errorMessage);
            errors.push(errorMessage);
          }
        }
      }

      onProgress?.({
        phase: 'building_index',
        processedFiles: currentFiles.length,
        totalFiles: currentFiles.length,
        stats,
        message: '🔗 Updating index...',
        detail: 'Merging changes with existing index...'
      });

      await this.storage.updateIndex(newFileIndices, removedFilePaths, (current, total) => {
        onProgress?.({
          phase: 'building_index',
          processedFiles: currentFiles.length,
          totalFiles: currentFiles.length,
          currentVector: current,
          totalVectors: total,
          stats,
          message: '🔗 Updating index...',
          detail: `${current}/${total} vectors processed`
        });
      });

      onProgress?.({
        phase: 'saving',
        processedFiles: currentFiles.length,
        totalFiles: currentFiles.length,
        stats,
        message: '💾 Finalizing index...',
        detail: 'Writing updated index to disk...'
      });

      const duration = Date.now() - startTime;
      const indexSize = await this.getIndexSize();

      onProgress?.({
        phase: 'complete',
        processedFiles: currentFiles.length,
        totalFiles: currentFiles.length,
        stats,
        message: '✅ Incremental indexing complete!',
        detail: `Updated ${addedFiles + modifiedFiles} files, removed ${removedFilePaths.length} files`
      });

      return {
        success: true,
        stats,
        totalVectors: newFileIndices.reduce((sum, fi) => sum + fi.embeddings.length, 0),
        indexSize,
        duration,
        errors
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        stats,
        totalVectors: 0,
        indexSize: 0,
        duration,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
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
