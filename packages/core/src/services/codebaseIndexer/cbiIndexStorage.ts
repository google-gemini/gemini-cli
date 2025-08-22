import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileIndex, IndexStatus } from './types.js';

const MAGIC_NUMBER = 0xC0DEB1D0;
const VERSION = 1;
const HEADER_SIZE = 84;

// Binary format constants for FileInfo struct (32 bytes total)
const FILE_INFO_SIZE = 32;
const FILE_INFO_MTIME_OFFSET = 0;
const FILE_INFO_SIZE_OFFSET = 8;
const FILE_INFO_PATH_OFFSET_OFFSET = 16;
const FILE_INFO_FIRST_VECTOR_ID_OFFSET = 24;
const FILE_INFO_NUM_VECTORS_OFFSET = 28;

// Binary format constants for BlockMetadata struct (24 bytes total)
const BLOCK_METADATA_SIZE = 24;
const BLOCK_METADATA_FILE_ID_OFFSET = 0;
const BLOCK_METADATA_LINENO_OFFSET = 4;
const BLOCK_METADATA_START_CHAR_OFFSET = 8;
const BLOCK_METADATA_TEXT_OFFSET_OFFSET = 12;
const BLOCK_METADATA_TEXT_LEN_OFFSET = 20;

// Binary format constants for Header struct
const HEADER_MAGIC_NUMBER_OFFSET = 0;
const HEADER_VERSION_OFFSET = 4;
const HEADER_VECTOR_DIM_OFFSET = 8;
const HEADER_TOTAL_VECTORS_OFFSET = 12;
const HEADER_TOTAL_FILES_OFFSET = 20;
const HEADER_OFFSET_FILES_OFFSET = 28;
const HEADER_OFFSET_BLOCKS_OFFSET = 36;
const HEADER_OFFSET_STRINGS_OFFSET = 44;
const HEADER_OFFSET_VECTORS_OFFSET = 52;
const HEADER_OFFSET_ANN_OFFSET = 60;
const HEADER_ANN_SIZE_OFFSET = 68;
const HEADER_EF_SEARCH_OFFSET = 76;

// HNSW graph constants
const HNSW_HEADER_SIZE = 24; // max_level, entry_point, m, ef_construction, ef_search, node_count
const HNSW_NODE_SIZE = 8; // id, level
const HNSW_DEFAULT_M = 16;
const HNSW_DEFAULT_EF_CONSTRUCTION = 200;
const HNSW_DEFAULT_EF_SEARCH = 50;
const HNSW_MIN_M = 4;
const HNSW_MIN_EF_CONSTRUCTION = 50;
const HNSW_SIMPLE_GRAPH_THRESHOLD = 100;

// Vector dimension constants
const VECTOR_FLOAT_SIZE = 4;

interface IndexHeader {
  magic_number: number;
  version: number;
  vector_dim: number;
  total_vectors: number;
  total_files: number;
  offset_files: number;
  offset_blocks: number;
  offset_strings: number;
  offset_vectors: number;
  offset_ann: number;
  ann_size: number;
  ef_search: number;
}

interface FileInfo {
  mtime: number;
  size: number;
  path_offset: number;
  first_vector_id: number;
  num_vectors: number;
  sha_offset?: number;
}

interface BlockMetadata {
  file_id: number;
  lineno: number;
  start_char: number;
  text_offset: number;
  text_len: number;
}

interface HNSWNode {
  id: number;
  level: number;
  neighbors: number[][];
}

interface HNSWGraph {
  nodes: HNSWNode[];
  max_level: number;
  entry_point: number;
  m: number;
  ef_construction: number;
  ef_search: number;
}

export class CBIIndexStorage {
  private readonly indexPath: string;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.indexPath = path.join(baseDir, 'index.cbi');
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  async indexExists(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.indexPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async createIndexDirectory(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async saveFileIndex(fileIndex: FileIndex): Promise<void> {
    console.warn('saveFileIndex is deprecated in CBI format - use saveIndex instead');
  }

  async loadFileIndex(relpath: string): Promise<FileIndex | null> {
    console.warn('loadFileIndex is deprecated in CBI format');
    return null;
  }

  async fileIndexExists(relpath: string): Promise<boolean> {
    console.warn('fileIndexExists is deprecated in CBI format');
    return false;
  }

  async getIndexStatus(): Promise<IndexStatus> {
    const exists = await this.indexExists();
    if (!exists) {
      return { exists: false };
    }

    try {
      const fileHandle = await fs.open(this.indexPath, 'r');
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      await fileHandle.close();

      const header = this.parseHeader(headerBuffer);
      const stats = await fs.stat(this.indexPath);

      return {
        exists: true,
        fileCount: header.total_files,
        vectorCount: header.total_vectors,
        lastUpdated: new Date(),
        sizeBytes: stats.size
      };
    } catch {
      return { exists: false };

  async saveIndex(fileIndices: FileIndex[], onProgress?: (current: number, total: number) => void): Promise<void> {
    const totalVectors = fileIndices.reduce((sum, fi) => sum + fi.embeddings.length, 0);
    const totalFiles = fileIndices.length;
    const vectorDim = fileIndices[0]?.embeddings[0]?.length || 0;

    const stringHeap: string[] = [];
    const fileInfos: FileInfo[] = [];
    const blockMetadatas: BlockMetadata[] = [];

    let currentVectorId = 0;
    let stringOffset = 0;

    // Create a temporary file for vectors to avoid loading all vectors into memory
    const tempVectorPath = path.join(os.tmpdir(), `vectors-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.bin`);
    const vectorFd = await fs.open(tempVectorPath, 'w');

    try {
      for (let fileId = 0; fileId < fileIndices.length; fileId++) {
        const fileIndex = fileIndices[fileId];
        
        const pathOffset = stringOffset;
        stringHeap.push(fileIndex.relpath);
        stringOffset += Buffer.byteLength(fileIndex.relpath, 'utf8') + 1;

        const firstVectorId = currentVectorId;
        const numVectors = fileIndex.embeddings.length;

        fileInfos.push({
          mtime: Math.floor(fileIndex.mtime.getTime() / 1000),
          size: fileIndex.size,
          path_offset: pathOffset,
          first_vector_id: firstVectorId,
          num_vectors: numVectors
        });

        for (let i = 0; i < fileIndex.units.length; i++) {
          const unit = fileIndex.units[i];
          const textOffset = stringOffset;
          stringHeap.push(unit.text);
          stringOffset += Buffer.byteLength(unit.text, 'utf8') + 1;

          blockMetadatas.push({
            file_id: fileId,
            lineno: unit.lineno,
            start_char: unit.start_char,
            text_offset: textOffset,
            text_len: Buffer.byteLength(unit.text, 'utf8')
          });

          // Stream vector to temp file instead of collecting in array
          const vectorBuffer = Buffer.alloc(vectorDim * VECTOR_FLOAT_SIZE);
          fileIndex.embeddings[i].forEach((val, idx) => vectorBuffer.writeFloatLE(val, idx * VECTOR_FLOAT_SIZE));
          await fs.appendFile(vectorFd, vectorBuffer);

          currentVectorId++;
        }

        // Progress update per file
        onProgress?.(fileId + 1, totalFiles);
      }

      // Create vector accessor function for streaming HNSW building
      const getVector = async (vectorId: number): Promise<number[]> => {
        const offset = vectorId * vectorDim * VECTOR_FLOAT_SIZE;
        const buffer = Buffer.alloc(vectorDim * VECTOR_FLOAT_SIZE);
        await vectorFd.read(buffer, 0, buffer.length, offset);
        return Array.from({ length: vectorDim }, (_, idx) => buffer.readFloatLE(idx * VECTOR_FLOAT_SIZE));
      };

      // Build HNSW index using streaming approach
      const hnswGraph = await this.buildHNSWIndexStreaming(getVector, totalVectors, vectorDim, onProgress);

      // Stream the entire index to disk to maintain memory efficiency
      await this.streamIndexToFile(vectorFd, vectorDim, totalVectors, totalFiles, fileInfos, blockMetadatas, stringHeap, hnswGraph);
    } finally {
      await vectorFd.close();
      try {
        await fs.unlink(tempVectorPath); // Cleanup temp file
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  async searchVectors(queryVector: number[], topK: number = 8): Promise<Array<{ score: number; vectorId: number; metadata: any }>> {
    const fileHandle = await fs.open(this.indexPath, 'r');
    
    try {
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      const header = this.parseHeader(headerBuffer);

      const batchSize = 1000;
      const results: Array<{ score: number; vectorId: number }> = [];
      
      for (let batchStart = 0; batchStart < header.total_vectors; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, header.total_vectors);
        const batchVectorCount = batchEnd - batchStart;
        
        const vectorsBuffer = Buffer.alloc(batchVectorCount * header.vector_dim * VECTOR_FLOAT_SIZE);
        const vectorsOffset = header.offset_vectors + (batchStart * header.vector_dim * VECTOR_FLOAT_SIZE);
        await fileHandle.read(vectorsBuffer, 0, vectorsBuffer.length, vectorsOffset);
        
        const batchVectors = this.parseVectors(vectorsBuffer, batchVectorCount, header.vector_dim);
        
        for (let i = 0; i < batchVectors.length; i++) {
          const vectorId = batchStart + i;
          const score = this.cosineSimilarity(queryVector, batchVectors[i]);
          results.push({ score, vectorId });
        }
      }
      
      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, topK);
      
      const fileInfosBuffer = Buffer.alloc(header.total_files * FILE_INFO_SIZE);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const blocksBuffer = Buffer.alloc(header.total_vectors * BLOCK_METADATA_SIZE);
      await fileHandle.read(blocksBuffer, 0, blocksBuffer.length, header.offset_blocks);
      const blockMetadatas = this.parseBlockMetadatas(blocksBuffer, header.total_vectors);

      const stringHeapBuffer = Buffer.alloc(header.offset_vectors - header.offset_strings);
      await fileHandle.read(stringHeapBuffer, 0, stringHeapBuffer.length, header.offset_strings);

      const resultWithMetadata = await Promise.all(topResults.map(async (result) => {
        const block = blockMetadatas[result.vectorId];
        const fileInfo = fileInfos[block.file_id];
        
        const relpath = this.extractStringFromHeap(stringHeapBuffer, fileInfo.path_offset);
        const text = this.extractStringFromHeap(stringHeapBuffer, block.text_offset, block.text_len);
        
        return {
          score: result.score,
          vectorId: result.vectorId,
          metadata: {
            relpath,
            lineno: block.lineno,
            start_char: block.start_char,
            text
          }
        };
      }));

      return resultWithMetadata;
    } finally {
      await fileHandle.close();
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private extractStringFromHeap(heapBuffer: Buffer, offset: number, length?: number): string {
    if (length !== undefined) {
      return heapBuffer.subarray(offset, offset + length).toString('utf8');
    }
    
    let endOffset = offset;
    while (endOffset < heapBuffer.length && heapBuffer[endOffset] !== 0) {
      endOffset++;
    }
    
    return heapBuffer.subarray(offset, endOffset).toString('utf8');
  }

  async deleteIndex(): Promise<void> {
    if (await this.indexExists()) {
      await fs.unlink(this.indexPath);
    }
  }

  async deleteFileIndicesBySha(shas: string[]): Promise<void> {
    console.warn('deleteFileIndicesBySha is deprecated in CBI format - use reindex instead');
  }

  async validateIndexIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      if (!(await this.indexExists())) {
        return { valid: false, errors: ['Index file does not exist'] };
      }

      const fileHandle = await fs.open(this.indexPath, 'r');
      
      try {
        const headerBuffer = Buffer.alloc(HEADER_SIZE);
        await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
        const header = this.parseHeader(headerBuffer);

        if (header.magic_number !== MAGIC_NUMBER) {
          errors.push('Invalid magic number');
        }

        if (header.version !== VERSION) {
          errors.push('Unsupported version');
        }

        const stats = await fs.stat(this.indexPath);
        if (stats.size < header.offset_ann) {
          errors.push('Index file is truncated');
        }
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      errors.push(`Error validating index: ${error}`);
    }

    return { valid: errors.length === 0, errors };
  }

  private createHeader(vectorDim: number, totalVectors: number, totalFiles: number, fileInfos: FileInfo[], blockMetadatas: BlockMetadata[], stringHeap: string[], allVectors: number[][], hnswGraph: HNSWGraph): IndexHeader {
    const offsetFiles = HEADER_SIZE;
    const offsetBlocks = offsetFiles + totalFiles * FILE_INFO_SIZE;
    const offsetStrings = offsetBlocks + totalVectors * BLOCK_METADATA_SIZE;
    const offsetVectors = offsetStrings + this.calculateStringHeapSize(stringHeap);
    const offsetAnn = offsetVectors + totalVectors * vectorDim * VECTOR_FLOAT_SIZE;
    
    const annSize = this.calculateHNSWSize(hnswGraph);

    return {
      magic_number: MAGIC_NUMBER,
      version: VERSION,
      vector_dim: vectorDim,
      total_vectors: totalVectors,
      total_files: totalFiles,
      offset_files: offsetFiles,
      offset_blocks: offsetBlocks,
      offset_strings: offsetStrings,
      offset_vectors: offsetVectors,
      offset_ann: offsetAnn,
      ann_size: annSize,
      ef_search: hnswGraph.ef_search
    };
  }



  private writeHeader(buffer: Buffer, header: IndexHeader): void {
    buffer.writeUInt32LE(header.magic_number, HEADER_MAGIC_NUMBER_OFFSET);
    buffer.writeUInt32LE(header.version, HEADER_VERSION_OFFSET);
    buffer.writeUInt32LE(header.vector_dim, HEADER_VECTOR_DIM_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.total_vectors), HEADER_TOTAL_VECTORS_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.total_files), HEADER_TOTAL_FILES_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.offset_files), HEADER_OFFSET_FILES_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.offset_blocks), HEADER_OFFSET_BLOCKS_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.offset_strings), HEADER_OFFSET_STRINGS_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.offset_vectors), HEADER_OFFSET_VECTORS_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.offset_ann), HEADER_OFFSET_ANN_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.ann_size), HEADER_ANN_SIZE_OFFSET);
    buffer.writeBigUInt64LE(BigInt(header.ef_search), HEADER_EF_SEARCH_OFFSET);
  }

  private writeFileInfos(buffer: Buffer, fileInfos: FileInfo[], offset: number): void {
    for (let i = 0; i < fileInfos.length; i++) {
      const fileInfo = fileInfos[i];
      const pos = offset + i * FILE_INFO_SIZE;
      buffer.writeBigUInt64LE(BigInt(fileInfo.mtime), pos + FILE_INFO_MTIME_OFFSET);
      buffer.writeBigUInt64LE(BigInt(fileInfo.size), pos + FILE_INFO_SIZE_OFFSET);
      buffer.writeBigUInt64LE(BigInt(fileInfo.path_offset), pos + FILE_INFO_PATH_OFFSET_OFFSET);
      buffer.writeUInt32LE(fileInfo.first_vector_id, pos + FILE_INFO_FIRST_VECTOR_ID_OFFSET);
      buffer.writeUInt32LE(fileInfo.num_vectors, pos + FILE_INFO_NUM_VECTORS_OFFSET);
    }
  }

  private writeBlockMetadatas(buffer: Buffer, blockMetadatas: BlockMetadata[], offset: number): void {
    for (let i = 0; i < blockMetadatas.length; i++) {
      const block = blockMetadatas[i];
      const pos = offset + i * BLOCK_METADATA_SIZE;
      buffer.writeUInt32LE(block.file_id, pos + BLOCK_METADATA_FILE_ID_OFFSET);
      buffer.writeUInt32LE(block.lineno, pos + BLOCK_METADATA_LINENO_OFFSET);
      buffer.writeUInt32LE(block.start_char, pos + BLOCK_METADATA_START_CHAR_OFFSET);
      buffer.writeBigUInt64LE(BigInt(block.text_offset), pos + BLOCK_METADATA_TEXT_OFFSET_OFFSET);
      buffer.writeUInt32LE(block.text_len, pos + BLOCK_METADATA_TEXT_LEN_OFFSET);
    }
  }

  private writeStringHeap(buffer: Buffer, stringHeap: string[], offset: number): void {
    let currentOffset = offset;
    for (const str of stringHeap) {
      const bytes = Buffer.from(str, 'utf8');
      bytes.copy(buffer, currentOffset);
      currentOffset += bytes.length;
      buffer.writeUInt8(0, currentOffset); // Add null terminator
      currentOffset += 1;
    }
  }



  private parseHeader(buffer: Buffer): IndexHeader {
    return {
      magic_number: buffer.readUInt32LE(HEADER_MAGIC_NUMBER_OFFSET),
      version: buffer.readUInt32LE(HEADER_VERSION_OFFSET),
      vector_dim: buffer.readUInt32LE(HEADER_VECTOR_DIM_OFFSET),
      total_vectors: Number(buffer.readBigUInt64LE(HEADER_TOTAL_VECTORS_OFFSET)),
      total_files: Number(buffer.readBigUInt64LE(HEADER_TOTAL_FILES_OFFSET)),
      offset_files: Number(buffer.readBigUInt64LE(HEADER_OFFSET_FILES_OFFSET)),
      offset_blocks: Number(buffer.readBigUInt64LE(HEADER_OFFSET_BLOCKS_OFFSET)),
      offset_strings: Number(buffer.readBigUInt64LE(HEADER_OFFSET_STRINGS_OFFSET)),
      offset_vectors: Number(buffer.readBigUInt64LE(HEADER_OFFSET_VECTORS_OFFSET)),
      offset_ann: Number(buffer.readBigUInt64LE(HEADER_OFFSET_ANN_OFFSET)),
      ann_size: Number(buffer.readBigUInt64LE(HEADER_ANN_SIZE_OFFSET)),
      ef_search: Number(buffer.readBigUInt64LE(HEADER_EF_SEARCH_OFFSET))
    };
  }

  private parseFileInfos(buffer: Buffer, totalFiles: number): FileInfo[] {
    const fileInfos: FileInfo[] = [];
    for (let i = 0; i < totalFiles; i++) {
      const pos = i * FILE_INFO_SIZE;
      fileInfos.push({
        mtime: Number(buffer.readBigUInt64LE(pos + FILE_INFO_MTIME_OFFSET)),
        size: Number(buffer.readBigUInt64LE(pos + FILE_INFO_SIZE_OFFSET)),
        path_offset: Number(buffer.readBigUInt64LE(pos + FILE_INFO_PATH_OFFSET_OFFSET)),
        first_vector_id: buffer.readUInt32LE(pos + FILE_INFO_FIRST_VECTOR_ID_OFFSET),
        num_vectors: buffer.readUInt32LE(pos + FILE_INFO_NUM_VECTORS_OFFSET)
      });
    }
    return fileInfos;
  }

  private parseBlockMetadatas(buffer: Buffer, totalVectors: number): BlockMetadata[] {
    const blockMetadatas: BlockMetadata[] = [];
    for (let i = 0; i < totalVectors; i++) {
      const pos = i * BLOCK_METADATA_SIZE;
      blockMetadatas.push({
        file_id: buffer.readUInt32LE(pos + BLOCK_METADATA_FILE_ID_OFFSET),
        lineno: buffer.readUInt32LE(pos + BLOCK_METADATA_LINENO_OFFSET),
        start_char: buffer.readUInt32LE(pos + BLOCK_METADATA_START_CHAR_OFFSET),
        text_offset: Number(buffer.readBigUInt64LE(pos + BLOCK_METADATA_TEXT_OFFSET_OFFSET)),
        text_len: buffer.readUInt32LE(pos + BLOCK_METADATA_TEXT_LEN_OFFSET)
      });
    }
    return blockMetadatas;
  }

  private parseVectors(buffer: Buffer, totalVectors: number, vectorDim: number): number[][] {
    const vectors: number[][] = [];
    for (let i = 0; i < totalVectors; i++) {
      const pos = i * vectorDim * VECTOR_FLOAT_SIZE;
      const vectorBuffer = buffer.slice(pos, pos + vectorDim * VECTOR_FLOAT_SIZE);
      const float32Array = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorDim);
      vectors.push(Array.from(float32Array));
    }
    return vectors;
  }

  private calculateStringHeapSize(stringHeap: string[]): number {
    return stringHeap.reduce((size, str) => size + Buffer.byteLength(str, 'utf8') + 1, 0);
  }

  private calculateHNSWSize(graph: HNSWGraph): number {
    let size = HNSW_HEADER_SIZE; // Header: max_level, entry_point, m, ef_construction, ef_search, node_count
    size += graph.nodes.length * HNSW_NODE_SIZE; // Each node: id, level
    
    for (const node of graph.nodes) {
      for (let level = 0; level <= graph.max_level; level++) {
        const neighbors = node.neighbors[level] || [];
        size += 4; // neighbor_count
        size += neighbors.length * 4; // neighbor_ids
      }
    }
    
    return size;
  }



  private async buildHNSWIndexStreaming(
    getVector: (vectorId: number) => Promise<number[]>,
    totalVectors: number,
    vectorDim: number,
    onProgress?: (current: number, total: number) => void
  ): Promise<HNSWGraph> {
    if (totalVectors === 0) {
      return {
        nodes: [],
        max_level: 0,
        entry_point: 0,
        m: HNSW_DEFAULT_M,
        ef_construction: HNSW_DEFAULT_EF_CONSTRUCTION,
        ef_search: HNSW_DEFAULT_EF_SEARCH
      };
    }

    if (totalVectors < HNSW_SIMPLE_GRAPH_THRESHOLD) {
      return {
        nodes: [],
        max_level: 0,
        entry_point: 0,
        m: HNSW_DEFAULT_M,
        ef_construction: HNSW_DEFAULT_EF_CONSTRUCTION,
        ef_search: HNSW_DEFAULT_EF_SEARCH
      };
    }

    const m = Math.min(HNSW_DEFAULT_M, Math.max(HNSW_MIN_M, Math.floor(Math.log(totalVectors) / Math.log(4))));
    const ef_construction = Math.min(HNSW_DEFAULT_EF_CONSTRUCTION, Math.max(HNSW_MIN_EF_CONSTRUCTION, totalVectors / 10));
    const ef_search = HNSW_DEFAULT_EF_SEARCH;
    const max_level = Math.max(0, Math.floor(Math.log(totalVectors) / Math.log(m)));

    // Simple LRU cache to reduce disk I/O during HNSW construction
    const cacheSize = Math.min(1000, Math.floor(totalVectors * 0.1));
    const vectorCache = new Map<number, number[]>();
    const cacheOrder: number[] = [];

    const cachedGetVector = async (vectorId: number): Promise<number[]> => {
      if (vectorCache.has(vectorId)) {
        // Move to end (most recently used)
        const index = cacheOrder.indexOf(vectorId);
        if (index > -1) {
          cacheOrder.splice(index, 1);
          cacheOrder.push(vectorId);
        }
        return vectorCache.get(vectorId)!;
      }

      const vector = await getVector(vectorId);
      
      // Add to cache
      vectorCache.set(vectorId, vector);
      cacheOrder.push(vectorId);
      
      // Evict oldest if cache is full
      if (vectorCache.size > cacheSize) {
        const oldest = cacheOrder.shift()!;
        vectorCache.delete(oldest);
      }
      
      return vector;
    };

    const nodes: HNSWNode[] = [];
    for (let i = 0; i < totalVectors; i++) {
      const level = Math.floor(Math.random() * (max_level + 1));
      nodes.push({
        id: i,
        level,
        neighbors: Array(max_level + 1).fill(null).map(() => [])
      });
    }

    const entry_point = 0;
    const graph: HNSWGraph = {
      nodes,
      max_level,
      entry_point,
      m,
      ef_construction,
      ef_search
    };

    const batchSize = Math.max(1, Math.floor(totalVectors / 50));
    for (let i = 1; i < totalVectors; i++) {
      await this.insertIntoHNSWStreaming(graph, cachedGetVector, i);
      
      if (i % batchSize === 0) {
        onProgress?.(i, totalVectors);
      }
    }

    return graph;
  }

  private async insertIntoHNSWStreaming(
    graph: HNSWGraph,
    getVector: (vectorId: number) => Promise<number[]>,
    vectorId: number
  ): Promise<void> {
    const queryVector = await getVector(vectorId);
    const node = graph.nodes[vectorId];
    const currentLevel = node.level;

    let currentEntryPoint = graph.entry_point;
    let currentMaxLevel = graph.nodes[currentEntryPoint].level;

    for (let level = currentMaxLevel; level > currentLevel; level--) {
      const neighbors = await this.searchLayerStreamingLocal(graph, getVector, queryVector, [currentEntryPoint], 1, level);
      if (neighbors.length > 0) {
        currentEntryPoint = neighbors[0];
      }
    }

    for (let level = Math.min(currentLevel, currentMaxLevel); level >= 0; level--) {
      const ef = Math.min(graph.ef_construction, Math.max(10, graph.nodes.length / 20));
      const neighbors = await this.searchLayerStreamingLocal(graph, getVector, queryVector, [currentEntryPoint], ef, level);
      const selectedNeighbors = await this.selectNeighborsStreamingLocal(graph, getVector, queryVector, neighbors, graph.m, level);
      
      for (const neighborId of selectedNeighbors) {
        this.addBidirectionalConnection(graph, vectorId, neighborId, level);
      }
      
      if (neighbors.length > 0) {
        currentEntryPoint = neighbors[0];
      }
    }

    if (currentLevel > currentMaxLevel) {
      graph.entry_point = vectorId;
    }
  }

  private async searchLayerStreamingLocal(
    graph: HNSWGraph,
    getVector: (vectorId: number) => Promise<number[]>,
    queryVector: number[],
    entryPoints: number[],
    ef: number,
    level: number
  ): Promise<number[]> {
    const visited = new Set<number>();
    const candidates = new Set<number>();
    const results: number[] = [];

    for (const entryPoint of entryPoints) {
      visited.add(entryPoint);
      candidates.add(entryPoint);
    }

    while (candidates.size > 0) {
      let bestCandidate = -1;
      let bestDistance = Infinity;

      for (const candidate of candidates) {
        const candidateVector = await getVector(candidate);
        const distance = this.cosineDistance(queryVector, candidateVector);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate === -1) break;

      candidates.delete(bestCandidate);
      results.push(bestCandidate);

      if (results.length >= ef) break;

      const neighbors = graph.nodes[bestCandidate].neighbors[level] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          candidates.add(neighbor);
        }
      }
    }

    return results;
  }

  private async selectNeighborsStreamingLocal(
    graph: HNSWGraph,
    getVector: (vectorId: number) => Promise<number[]>,
    queryVector: number[],
    candidates: number[],
    m: number,
    level: number
  ): Promise<number[]> {
    if (candidates.length <= m) {
      return candidates;
    }

    const distances = await Promise.all(candidates.map(async id => {
      const vector = await getVector(id);
      return {
        id,
        distance: this.cosineDistance(queryVector, vector)
      };
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, m).map(d => d.id);
  }



  private addBidirectionalConnection(graph: HNSWGraph, id1: number, id2: number, level: number): void {
    const node1 = graph.nodes[id1];
    const node2 = graph.nodes[id2];

    if (!node1.neighbors[level].includes(id2)) {
      node1.neighbors[level].push(id2);
    }

    if (!node2.neighbors[level].includes(id1)) {
      node2.neighbors[level].push(id1);
    }
  }

  private cosineDistance(a: number[], b: number[]): number {
    return 1 - this.cosineSimilarity(a, b);
  }



  private async loadVector(vectorId: number, fileHandle: fs.FileHandle, header: IndexHeader): Promise<number[]> {
    const vectorBuffer = Buffer.alloc(header.vector_dim * VECTOR_FLOAT_SIZE);
    const vectorOffset = header.offset_vectors + (vectorId * header.vector_dim * VECTOR_FLOAT_SIZE);
    await fileHandle.read(vectorBuffer, 0, vectorBuffer.length, vectorOffset);
    return Array.from(new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, header.vector_dim));
  }

  private async searchLayerWithFileAccess(
    graph: HNSWGraph, 
    queryVector: number[], 
    entryPoints: number[], 
    ef: number, 
    level: number,
    fileHandle: fs.FileHandle,
    header: IndexHeader
  ): Promise<number[]> {
    const visited = new Set<number>();
    const candidates = new Set<number>();
    const results: Array<{ id: number; distance: number }> = [];

    for (const entryPoint of entryPoints) {
      candidates.add(entryPoint);
      visited.add(entryPoint);
    }

    while (candidates.size > 0) {
      let bestCandidate = -1;
      let bestDistance = Infinity;

      for (const candidate of candidates) {
        const vector = await this.loadVector(candidate, fileHandle, header);
        const distance = this.cosineDistance(queryVector, vector);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate === -1) break;

      candidates.delete(bestCandidate);
      results.push({ id: bestCandidate, distance: bestDistance });

      if (results.length >= ef) break;

      const node = graph.nodes[bestCandidate];
      if (node.level >= level) {
        for (const neighborId of node.neighbors[level]) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            candidates.add(neighborId);
          }
        }
      }
    }

    return results.map(r => r.id);
  }

  private async selectNeighborsWithFileAccess(
    queryVector: number[], 
    candidates: number[], 
    m: number,
    fileHandle: fs.FileHandle,
    header: IndexHeader
  ): Promise<number[]> {
    const distances = await Promise.all(candidates.map(async id => {
      const vector = await this.loadVector(id, fileHandle, header);
      return {
        id,
        distance: this.cosineDistance(queryVector, vector)
      };
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, m).map(d => d.id);
  }

  private writeHNSWGraph(buffer: Buffer, graph: HNSWGraph, offset: number): void {
    let currentOffset = offset;

    buffer.writeUInt32LE(graph.max_level, currentOffset);
    currentOffset += 4;
    buffer.writeUInt32LE(graph.entry_point, currentOffset);
    currentOffset += 4;
    buffer.writeUInt32LE(graph.m, currentOffset);
    currentOffset += 4;
    buffer.writeUInt32LE(graph.ef_construction, currentOffset);
    currentOffset += 4;
    buffer.writeUInt32LE(graph.ef_search, currentOffset);
    currentOffset += 4;
    buffer.writeUInt32LE(graph.nodes.length, currentOffset);
    currentOffset += 4;

    for (const node of graph.nodes) {
      buffer.writeUInt32LE(node.id, currentOffset);
      currentOffset += 4;
      buffer.writeUInt32LE(node.level, currentOffset);
      currentOffset += 4;

      for (let level = 0; level <= graph.max_level; level++) {
        const neighbors = node.neighbors[level] || [];
        buffer.writeUInt32LE(neighbors.length, currentOffset);
        currentOffset += 4;

        for (const neighborId of neighbors) {
          buffer.writeUInt32LE(neighborId, currentOffset);
          currentOffset += 4;
        }
      }
    }
  }

  private parseHNSWGraph(buffer: Buffer, offset: number): HNSWGraph {
    let currentOffset = offset;

    const max_level = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;
    const entry_point = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;
    const m = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;
    const ef_construction = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;
    const ef_search = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;
    const nodeCount = buffer.readUInt32LE(currentOffset);
    currentOffset += 4;

    const nodes: HNSWNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const id = buffer.readUInt32LE(currentOffset);
      currentOffset += 4;
      const level = buffer.readUInt32LE(currentOffset);
      currentOffset += 4;

      const neighbors: number[][] = [];
      for (let level_idx = 0; level_idx <= max_level; level_idx++) {
        const neighborCount = buffer.readUInt32LE(currentOffset);
        currentOffset += 4;
        const levelNeighbors: number[] = [];
        for (let j = 0; j < neighborCount; j++) {
          levelNeighbors.push(buffer.readUInt32LE(currentOffset));
          currentOffset += 4;
        }
        neighbors.push(levelNeighbors);
      }

      nodes.push({ id, level, neighbors });
    }

    return {
      nodes,
      max_level,
      entry_point,
      m,
      ef_construction,
      ef_search
    };
  }

  async loadFileMetadata(): Promise<Map<string, { mtime: number; size: number; vectorIds: number[] }>> {
    if (!(await this.indexExists())) {
      return new Map();
    }

    const fileHandle = await fs.open(this.indexPath, 'r');
    try {
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      const header = this.parseHeader(headerBuffer);

      const fileInfosBuffer = Buffer.alloc(header.total_files * FILE_INFO_SIZE);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const stringHeapSize = header.offset_vectors - header.offset_strings;
      const stringHeapBuffer = Buffer.alloc(stringHeapSize);
      await fileHandle.read(stringHeapBuffer, 0, stringHeapSize, header.offset_strings);

      const metadata = new Map<string, { mtime: number; size: number; vectorIds: number[] }>();
      
      for (const fileInfo of fileInfos) {
        const relpath = this.extractStringFromHeap(stringHeapBuffer, fileInfo.path_offset);
        const vectorIds: number[] = [];
        for (let i = 0; i < fileInfo.num_vectors; i++) {
          vectorIds.push(fileInfo.first_vector_id + i);
        }
        
        metadata.set(relpath, {
          mtime: fileInfo.mtime,
          size: fileInfo.size,
          vectorIds
        });
      }

      return metadata;
    } finally {
      await fileHandle.close();
    }
  }

  async updateIndex(
    newFileIndices: FileIndex[], 
    removedFilePaths: string[], 
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (!(await this.indexExists())) {
      return this.saveIndex(newFileIndices, onProgress);
    }

    const toRemove = new Set(removedFilePaths);
    
    for (const fileIndex of newFileIndices) {
      toRemove.add(fileIndex.relpath);
    }

    if (toRemove.size === 0 && newFileIndices.length === 0) {
      return;
    }

    await this.streamingUpdateIndex(newFileIndices, toRemove, onProgress);
  }

  private async streamingUpdateIndex(
    newFileIndices: FileIndex[], 
    toRemove: Set<string>, 
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const tempIndexPath = this.indexPath + '.tmp';
    const sourceHandle = await fs.open(this.indexPath, 'r');
    const targetHandle = await fs.open(tempIndexPath, 'w');
    
    try {
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await sourceHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      const oldHeader = this.parseHeader(headerBuffer);

      const fileInfosBuffer = Buffer.alloc(oldHeader.total_files * FILE_INFO_SIZE);
      await sourceHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, oldHeader.offset_files);
      const oldFileInfos = this.parseFileInfos(fileInfosBuffer, oldHeader.total_files);

      const blocksBuffer = Buffer.alloc(oldHeader.total_vectors * BLOCK_METADATA_SIZE);
      await sourceHandle.read(blocksBuffer, 0, blocksBuffer.length, oldHeader.offset_blocks);
      const oldBlockMetadatas = this.parseBlockMetadatas(blocksBuffer, oldHeader.total_vectors);

      const stringHeapSize = oldHeader.offset_vectors - oldHeader.offset_strings;
      const stringHeapBuffer = Buffer.alloc(stringHeapSize);
      await sourceHandle.read(stringHeapBuffer, 0, stringHeapSize, oldHeader.offset_strings);

      const newFileInfos: FileInfo[] = [];
      const newBlockMetadatas: BlockMetadata[] = [];
      const newStringHeap: string[] = [];
      const keptFileMapping: Map<number, { fileInfo: FileInfo, vectorIds: number[] }> = new Map();

      let currentVectorId = 0;
      let stringOffset = 0;
      let totalVectors = 0;

      for (let fileId = 0; fileId < oldFileInfos.length; fileId++) {
        const fileInfo = oldFileInfos[fileId];
        const relpath = this.extractStringFromHeap(stringHeapBuffer, fileInfo.path_offset);
        
        if (toRemove.has(relpath)) {
          continue;
        }

        const pathOffset = stringOffset;
        newStringHeap.push(relpath);
        stringOffset += Buffer.byteLength(relpath, 'utf8') + 1;

        const firstVectorId = currentVectorId;
        const numVectors = fileInfo.num_vectors;

        const newFileInfo = {
          mtime: fileInfo.mtime,
          size: fileInfo.size,
          path_offset: pathOffset,
          first_vector_id: firstVectorId,
          num_vectors: numVectors
        };

        newFileInfos.push(newFileInfo);

        const vectorIds: number[] = [];

        for (let i = 0; i < fileInfo.num_vectors; i++) {
          const oldVectorId = fileInfo.first_vector_id + i;
          const block = oldBlockMetadatas[oldVectorId];
          
          const text = this.extractStringFromHeap(stringHeapBuffer, block.text_offset, block.text_len);
          const textOffset = stringOffset;
          newStringHeap.push(text);
          stringOffset += Buffer.byteLength(text, 'utf8') + 1;

          newBlockMetadatas.push({
            file_id: newFileInfos.length - 1,
            lineno: block.lineno,
            start_char: block.start_char,
            text_offset: textOffset,
            text_len: Buffer.byteLength(text, 'utf8')
          });

          vectorIds.push(oldVectorId);
          currentVectorId++;
          totalVectors++;
        }

        keptFileMapping.set(newFileInfos.length - 1, { fileInfo: newFileInfo, vectorIds });
      }

      const totalFiles = newFileInfos.length;
      const vectorDim = (newFileIndices[0]?.embeddings[0]?.length || oldHeader.vector_dim);

      for (const fileIndex of newFileIndices) {
        const pathOffset = stringOffset;
        newStringHeap.push(fileIndex.relpath);
        stringOffset += Buffer.byteLength(fileIndex.relpath, 'utf8') + 1;

        const firstVectorId = currentVectorId;
        const numVectors = fileIndex.embeddings.length;

        newFileInfos.push({
          mtime: Math.floor(fileIndex.mtime.getTime() / 1000),
          size: fileIndex.size,
          path_offset: pathOffset,
          first_vector_id: firstVectorId,
          num_vectors: numVectors
        });

        for (let i = 0; i < fileIndex.units.length; i++) {
          const unit = fileIndex.units[i];
          const textOffset = stringOffset;
          newStringHeap.push(unit.text);
          stringOffset += Buffer.byteLength(unit.text, 'utf8') + 1;

          newBlockMetadatas.push({
            file_id: newFileInfos.length - 1,
            lineno: unit.lineno,
            start_char: unit.start_char,
            text_offset: textOffset,
            text_len: Buffer.byteLength(unit.text, 'utf8')
          });

          currentVectorId++;
          totalVectors++;
        }
      }

      const newHeader = this.createHeader(vectorDim, totalVectors, totalFiles, newFileInfos, newBlockMetadatas, newStringHeap, [], { nodes: [], max_level: 0, entry_point: 0, m: 16, ef_construction: 200, ef_search: 50 });
      
      const newHeaderBuffer = Buffer.alloc(newHeader.offset_ann);
      this.writeHeader(newHeaderBuffer, newHeader);
      this.writeFileInfos(newHeaderBuffer, newFileInfos, newHeader.offset_files);
      this.writeBlockMetadatas(newHeaderBuffer, newBlockMetadatas, newHeader.offset_blocks);
      this.writeStringHeap(newHeaderBuffer, newStringHeap, newHeader.offset_strings);

      await targetHandle.write(newHeaderBuffer);

      let vectorOffset = newHeader.offset_vectors;
      let vectorCount = 0;

      for (const [, { vectorIds }] of keptFileMapping) {
        for (const oldVectorId of vectorIds) {
          const vector = await this.loadVector(oldVectorId, sourceHandle, oldHeader);
          const float32Array = new Float32Array(vector);
          const vectorBuffer = Buffer.from(float32Array.buffer);
          await targetHandle.write(vectorBuffer, 0, vectorBuffer.length, vectorOffset);
          vectorOffset += vectorBuffer.length;
          vectorCount++;
          onProgress?.(vectorCount, totalVectors);
        }
      }

      for (const fileIndex of newFileIndices) {
        for (const vector of fileIndex.embeddings) {
          const float32Array = new Float32Array(vector);
          const vectorBuffer = Buffer.from(float32Array.buffer);
          await targetHandle.write(vectorBuffer, 0, vectorBuffer.length, vectorOffset);
          vectorOffset += vectorBuffer.length;
          vectorCount++;
          onProgress?.(vectorCount, totalVectors);
        }
      }

      await this.buildHNSWIndexForUpdate(targetHandle, newHeader, keptFileMapping, newFileIndices, oldHeader, sourceHandle, onProgress);
      
      await targetHandle.sync();
      await fs.rename(tempIndexPath, this.indexPath);
    } finally {
      await sourceHandle.close();
      await targetHandle.close();
    }
  }

  private async buildHNSWIndexForUpdate(
    targetHandle: fs.FileHandle,
    newHeader: IndexHeader,
    keptFileMapping: Map<number, { fileInfo: FileInfo, vectorIds: number[] }>,
    newFileIndices: FileIndex[],
    oldHeader: IndexHeader,
    sourceHandle: fs.FileHandle,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const totalVectors = newHeader.total_vectors;
    
    if (totalVectors === 0) {
      const emptyGraph = { nodes: [], max_level: 0, entry_point: 0, m: HNSW_DEFAULT_M, ef_construction: HNSW_DEFAULT_EF_CONSTRUCTION, ef_search: HNSW_DEFAULT_EF_SEARCH };
      const annBuffer = Buffer.alloc(HNSW_HEADER_SIZE);
      let annOffset = 0;
      
      annBuffer.writeUInt32LE(emptyGraph.max_level, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(emptyGraph.entry_point, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(emptyGraph.m, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(emptyGraph.ef_construction, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(emptyGraph.ef_search, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(emptyGraph.nodes.length, annOffset);
      
      await targetHandle.write(annBuffer, 0, annBuffer.length, newHeader.offset_ann);
      return;
    }

    if (totalVectors < HNSW_SIMPLE_GRAPH_THRESHOLD) {
      const simpleGraph = { nodes: [], max_level: 0, entry_point: 0, m: HNSW_DEFAULT_M, ef_construction: HNSW_DEFAULT_EF_CONSTRUCTION, ef_search: HNSW_DEFAULT_EF_SEARCH };
      const annBuffer = Buffer.alloc(HNSW_HEADER_SIZE);
      let annOffset = 0;
      
      annBuffer.writeUInt32LE(simpleGraph.max_level, annOffset);
        annOffset += 4;
      annBuffer.writeUInt32LE(simpleGraph.entry_point, annOffset);
        annOffset += 4;
      annBuffer.writeUInt32LE(simpleGraph.m, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(simpleGraph.ef_construction, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(simpleGraph.ef_search, annOffset);
      annOffset += 4;
      annBuffer.writeUInt32LE(simpleGraph.nodes.length, annOffset);
      
      await targetHandle.write(annBuffer, 0, annBuffer.length, newHeader.offset_ann);
      return;
    }

    const m = Math.min(HNSW_DEFAULT_M, Math.max(HNSW_MIN_M, Math.floor(Math.log(totalVectors) / Math.log(4))));
    const ef_construction = Math.min(200, Math.max(50, totalVectors / 10));
    const ef_search = 50;
    const max_level = Math.max(0, Math.floor(Math.log(totalVectors) / Math.log(m)));

    const nodes: HNSWNode[] = [];
    for (let i = 0; i < totalVectors; i++) {
      const level = Math.floor(Math.random() * (max_level + 1));
      nodes.push({
        id: i,
        level,
        neighbors: Array(max_level + 1).fill(null).map(() => [])
      });
    }

    const entry_point = 0;
    const graph: HNSWGraph = {
      nodes,
      max_level,
      entry_point,
      m,
      ef_construction,
      ef_search
    };

    // Simple LRU cache to reduce disk I/O during HNSW construction
    const cacheSize = Math.min(1000, Math.floor(totalVectors * 0.1));
    const vectorCache = new Map<number, number[]>();
    const cacheOrder: number[] = [];

    const cachedLoadVectorById = async (vectorId: number): Promise<number[]> => {
      if (vectorCache.has(vectorId)) {
        // Move to end (most recently used)
        const index = cacheOrder.indexOf(vectorId);
        if (index > -1) {
          cacheOrder.splice(index, 1);
          cacheOrder.push(vectorId);
        }
        return vectorCache.get(vectorId)!;
      }

      const vector = await this.loadVectorById(vectorId, targetHandle, newHeader, keptFileMapping, newFileIndices, oldHeader, sourceHandle);
      
      // Add to cache
      vectorCache.set(vectorId, vector);
      cacheOrder.push(vectorId);
      
      // Evict oldest if cache is full
      if (vectorCache.size > cacheSize) {
        const oldest = cacheOrder.shift()!;
        vectorCache.delete(oldest);
      }
      
      return vector;
    };

    const batchSize = Math.max(1, Math.floor(totalVectors / 50));
    for (let i = 1; i < totalVectors; i++) {
      const vector = await cachedLoadVectorById(i);
      await this.insertIntoHNSWForUpdateWithCache(graph, vector, i, cachedLoadVectorById);
      
      if (i % batchSize === 0) {
        onProgress?.(i, totalVectors);
      }
    }

    const annBuffer = Buffer.alloc(this.calculateHNSWSize(graph));
    this.writeHNSWGraph(annBuffer, graph, 0);
      await targetHandle.write(annBuffer, 0, annBuffer.length, newHeader.offset_ann);
  }

  private async loadVectorById(
    vectorId: number,
    targetHandle: fs.FileHandle,
    newHeader: IndexHeader,
    keptFileMapping: Map<number, { fileInfo: FileInfo, vectorIds: number[] }>,
    newFileIndices: FileIndex[],
    oldHeader: IndexHeader,
    sourceHandle: fs.FileHandle
  ): Promise<number[]> {
    let currentVectorId = 0;
    
    for (const [, { vectorIds }] of keptFileMapping) {
      for (const oldVectorId of vectorIds) {
        if (currentVectorId === vectorId) {
          return await this.loadVector(oldVectorId, sourceHandle, oldHeader);
        }
        currentVectorId++;
      }
    }

    for (const fileIndex of newFileIndices) {
      for (const vector of fileIndex.embeddings) {
        if (currentVectorId === vectorId) {
          return vector;
        }
        currentVectorId++;
      }
    }

    throw new Error(`Vector ID ${vectorId} not found`);
  }





  async searchWithHNSW(queryVector: number[], topK: number = 8): Promise<Array<{ score: number; vectorId: number; metadata: any }>> {
    const fileHandle = await fs.open(this.indexPath, 'r');
    try {
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      const header = this.parseHeader(headerBuffer);

      if (header.ann_size === 0) {
        return this.searchVectors(queryVector, topK);
      }

      const annBuffer = Buffer.alloc(header.ann_size);
      await fileHandle.read(annBuffer, 0, header.ann_size, header.offset_ann);
      const graph = this.parseHNSWGraph(annBuffer, 0);

      if (graph.nodes.length === 0) {
        return this.searchVectors(queryVector, topK);
      }

      const candidates = await this.searchLayerWithFileAccess(graph, queryVector, [graph.entry_point], header.ef_search || 50, 0, fileHandle, header);
      const topCandidates = await this.selectNeighborsWithFileAccess(queryVector, candidates, topK, fileHandle, header);

      const fileInfosBuffer = Buffer.alloc(header.total_files * FILE_INFO_SIZE);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const blocksBuffer = Buffer.alloc(header.total_vectors * BLOCK_METADATA_SIZE);
      await fileHandle.read(blocksBuffer, 0, blocksBuffer.length, header.offset_blocks);
      const blockMetadatas = this.parseBlockMetadatas(blocksBuffer, header.total_vectors);

      const stringHeapBuffer = Buffer.alloc(header.offset_vectors - header.offset_strings);
      await fileHandle.read(stringHeapBuffer, 0, stringHeapBuffer.length, header.offset_strings);

      const results = [];
      for (const vectorId of topCandidates) {
        const block = blockMetadatas[vectorId];
        const fileInfo = fileInfos[block.file_id];

        const relpath = this.extractStringFromHeap(stringHeapBuffer, fileInfo.path_offset);
        const text = this.extractStringFromHeap(stringHeapBuffer, block.text_offset, block.text_len);

        const vector = await this.loadVector(vectorId, fileHandle, header);
        const score = this.cosineSimilarity(queryVector, vector);

        results.push({
          score,
          vectorId,
          metadata: {
            relpath,
            lineno: block.lineno,
            start_char: block.start_char,
            text
          }
        });
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } finally {
      await fileHandle.close();
    }
  }

  private async streamIndexToFile(
    vectorFd: fs.FileHandle,
    vectorDim: number,
    totalVectors: number,
    totalFiles: number,
    fileInfos: FileInfo[],
    blockMetadatas: BlockMetadata[],
    stringHeap: string[],
    hnswGraph: HNSWGraph
  ): Promise<void> {
    // Create a temporary index file
    const tempIndexPath = this.indexPath + '.tmp';
    const indexFd = await fs.open(tempIndexPath, 'w');
    
    try {
      // Calculate header with placeholder vectors size (we'll update it later)
      const header = this.createHeader(vectorDim, totalVectors, totalFiles, fileInfos, blockMetadatas, stringHeap, [], hnswGraph);
      
      // Write header
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      this.writeHeader(headerBuffer, header);
      await indexFd.write(headerBuffer);
      
      // Write file infos
      const fileInfosBuffer = Buffer.alloc(totalFiles * FILE_INFO_SIZE);
      this.writeFileInfos(fileInfosBuffer, fileInfos, 0);
      await indexFd.write(fileInfosBuffer);
      
      // Write block metadatas
      const blockMetadatasBuffer = Buffer.alloc(totalVectors * BLOCK_METADATA_SIZE);
      this.writeBlockMetadatas(blockMetadatasBuffer, blockMetadatas, 0);
      await indexFd.write(blockMetadatasBuffer);
      
      // Write string heap
      const stringHeapBuffer = Buffer.alloc(this.calculateStringHeapSize(stringHeap));
      this.writeStringHeap(stringHeapBuffer, stringHeap, 0);
      await indexFd.write(stringHeapBuffer);
      
      // Stream vectors from temporary file to index file
      const vectorBuffer = Buffer.alloc(64 * 1024); // 64KB buffer for streaming
      let bytesRead = 0;
      let totalBytesRead = 0;
      const totalVectorBytes = totalVectors * vectorDim * VECTOR_FLOAT_SIZE;
      
      // Stream vectors from temporary file to index file
      while (totalBytesRead < totalVectorBytes) {
        const bytesToRead = Math.min(vectorBuffer.length, totalVectorBytes - totalBytesRead);
        const readResult = await vectorFd.read(vectorBuffer, 0, bytesToRead, totalBytesRead);
        bytesRead = readResult.bytesRead;
        
        if (bytesRead === 0) break;
        
        await indexFd.write(vectorBuffer, 0, bytesRead);
        totalBytesRead += bytesRead;
      }
      
      // Write HNSW graph
      const hnswBuffer = Buffer.alloc(this.calculateHNSWSize(hnswGraph));
      this.writeHNSWGraph(hnswBuffer, hnswGraph, 0);
      await indexFd.write(hnswBuffer);
      
      // Ensure all data is written
      await indexFd.sync();
      
      // Rename temporary file to final index file
      await fs.rename(tempIndexPath, this.indexPath);
    } finally {
      await indexFd.close();
    }
  }

  private async insertIntoHNSWForUpdateWithCache(
    graph: HNSWGraph, 
    queryVector: number[], 
    vectorId: number,
    cachedLoadVectorById: (vectorId: number) => Promise<number[]>
  ): Promise<void> {
    const node = graph.nodes[vectorId];
    const currentLevel = node.level;

    let currentEntryPoint = graph.entry_point;
    let currentMaxLevel = graph.nodes[currentEntryPoint].level;

    for (let level = currentMaxLevel; level > currentLevel; level--) {
      const neighbors = await this.searchLayerForUpdateWithCache(graph, queryVector, [currentEntryPoint], 1, level, cachedLoadVectorById);
      if (neighbors.length > 0) {
        currentEntryPoint = neighbors[0];
      }
    }

    for (let level = Math.min(currentLevel, currentMaxLevel); level >= 0; level--) {
      const ef = Math.min(graph.ef_construction, Math.max(10, graph.nodes.length / 20));
      const neighbors = await this.searchLayerForUpdateWithCache(graph, queryVector, [currentEntryPoint], ef, level, cachedLoadVectorById);
      const selectedNeighbors = await this.selectNeighborsForUpdateWithCache(graph, queryVector, neighbors, graph.m, level, cachedLoadVectorById);
      
      for (const neighborId of selectedNeighbors) {
        this.addBidirectionalConnection(graph, vectorId, neighborId, level);
      }
      
      if (neighbors.length > 0) {
        currentEntryPoint = neighbors[0];
      }
    }

    if (currentLevel > currentMaxLevel) {
      graph.entry_point = vectorId;
    }
  }

  private async searchLayerForUpdateWithCache(
    graph: HNSWGraph, 
    queryVector: number[], 
    entryPoints: number[], 
    ef: number, 
    level: number,
    cachedLoadVectorById: (vectorId: number) => Promise<number[]>
  ): Promise<number[]> {
    const visited = new Set<number>();
    const candidates = new Set<number>();
    const results: number[] = [];

    for (const entryPoint of entryPoints) {
      candidates.add(entryPoint);
      visited.add(entryPoint);
    }

    while (candidates.size > 0) {
      let bestCandidate = -1;
      let bestDistance = Infinity;

      for (const candidate of candidates) {
        const vector = await cachedLoadVectorById(candidate);
        const distance = this.cosineDistance(queryVector, vector);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate === -1) break;

      candidates.delete(bestCandidate);
      results.push(bestCandidate);

      if (results.length >= ef) break;

      const node = graph.nodes[bestCandidate];
      if (node.level >= level) {
        for (const neighborId of node.neighbors[level]) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            candidates.add(neighborId);
          }
        }
      }
    }

    return results;
  }

  private async selectNeighborsForUpdateWithCache(
    graph: HNSWGraph, 
    queryVector: number[], 
    candidates: number[], 
    m: number, 
    level: number,
    cachedLoadVectorById: (vectorId: number) => Promise<number[]>
  ): Promise<number[]> {
    const distances = await Promise.all(candidates.map(async id => {
      const vector = await cachedLoadVectorById(id);
      return {
        id,
        distance: this.cosineDistance(queryVector, vector)
      };
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, m).map(d => d.id);
  }

}
