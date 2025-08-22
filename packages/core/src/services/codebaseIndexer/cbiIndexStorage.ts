import * as fs from 'fs/promises';
import * as path from 'path';
import { FileIndex, IndexStatus } from './types.js';

const MAGIC_NUMBER = 0xC0DEB1D0;
const VERSION = 1;
const HEADER_SIZE = 136;

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
      return { exists: true };
    }
  }

  async saveIndex(fileIndices: FileIndex[], onProgress?: (current: number, total: number) => void): Promise<void> {
    const totalVectors = fileIndices.reduce((sum, fi) => sum + fi.embeddings.length, 0);
    const totalFiles = fileIndices.length;
    const vectorDim = fileIndices[0]?.embeddings[0]?.length || 0;

    const stringHeap: string[] = [];
    const fileInfos: FileInfo[] = [];
    const blockMetadatas: BlockMetadata[] = [];
    const allVectors: number[][] = [];

    let currentVectorId = 0;
    let stringOffset = 0;

    for (let fileId = 0; fileId < fileIndices.length; fileId++) {
      const fileIndex = fileIndices[fileId];
      
      const pathOffset = stringOffset;
      stringHeap.push(fileIndex.relpath);
      stringOffset += Buffer.byteLength(fileIndex.relpath, 'utf8');

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
        stringOffset += Buffer.byteLength(unit.text, 'utf8');

        blockMetadatas.push({
          file_id: fileId,
          lineno: unit.lineno,
          start_char: unit.start_char,
          text_offset: textOffset,
          text_len: Buffer.byteLength(unit.text, 'utf8')
        });

        allVectors.push(fileIndex.embeddings[i]);
        currentVectorId++;
      }
    }

    const hnswGraph = this.buildHNSWIndex(allVectors, onProgress);
    const header = this.createHeader(vectorDim, totalVectors, totalFiles, fileInfos, blockMetadatas, stringHeap, allVectors, hnswGraph);
    const indexBuffer = this.serializeIndex(header, fileInfos, blockMetadatas, stringHeap, allVectors, hnswGraph);

    await fs.writeFile(this.indexPath, indexBuffer);
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
        
        const vectorsBuffer = Buffer.alloc(batchVectorCount * header.vector_dim * 4);
        const vectorsOffset = header.offset_vectors + (batchStart * header.vector_dim * 4);
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
      
      const fileInfosBuffer = Buffer.alloc(header.total_files * 32);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const blocksBuffer = Buffer.alloc(header.total_vectors * 24);
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
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
    const offsetBlocks = offsetFiles + totalFiles * 32;
    const offsetStrings = offsetBlocks + totalVectors * 24;
    const offsetVectors = offsetStrings + this.calculateStringHeapSize(stringHeap);
    const offsetAnn = offsetVectors + totalVectors * vectorDim * 4;
    
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

  private serializeIndex(header: IndexHeader, fileInfos: FileInfo[], blockMetadatas: BlockMetadata[], stringHeap: string[], allVectors: number[][], hnswGraph: HNSWGraph): Buffer {
    const totalSize = header.offset_ann + header.ann_size;

    const buffer = Buffer.alloc(totalSize);

    this.writeHeader(buffer, header);
    this.writeFileInfos(buffer, fileInfos, header.offset_files);
    this.writeBlockMetadatas(buffer, blockMetadatas, header.offset_blocks);
    this.writeStringHeap(buffer, stringHeap, header.offset_strings);
    this.writeVectors(buffer, allVectors, header.offset_vectors);
    this.writeHNSWGraph(buffer, hnswGraph, header.offset_ann);

    return buffer;
  }

  private writeHeader(buffer: Buffer, header: IndexHeader): void {
    buffer.writeUInt32LE(header.magic_number, 0);
    buffer.writeUInt32LE(header.version, 4);
    buffer.writeUInt32LE(header.vector_dim, 8);
    buffer.writeBigUInt64LE(BigInt(header.total_vectors), 12);
    buffer.writeBigUInt64LE(BigInt(header.total_files), 20);
    buffer.writeBigUInt64LE(BigInt(header.offset_files), 28);
    buffer.writeBigUInt64LE(BigInt(header.offset_blocks), 36);
    buffer.writeBigUInt64LE(BigInt(header.offset_strings), 44);
    buffer.writeBigUInt64LE(BigInt(header.offset_vectors), 52);
    buffer.writeBigUInt64LE(BigInt(header.offset_ann), 60);
    buffer.writeBigUInt64LE(BigInt(header.ann_size), 68); // Write ann_size
    buffer.writeBigUInt64LE(BigInt(header.ef_search), 76); // Write ef_search
  }

  private writeFileInfos(buffer: Buffer, fileInfos: FileInfo[], offset: number): void {
    for (let i = 0; i < fileInfos.length; i++) {
      const fileInfo = fileInfos[i];
      const pos = offset + i * 32;
      buffer.writeBigUInt64LE(BigInt(fileInfo.mtime), pos);
      buffer.writeBigUInt64LE(BigInt(fileInfo.size), pos + 8);
      buffer.writeBigUInt64LE(BigInt(fileInfo.path_offset), pos + 16);
      buffer.writeUInt32LE(fileInfo.first_vector_id, pos + 24);
      buffer.writeUInt32LE(fileInfo.num_vectors, pos + 28);
    }
  }

  private writeBlockMetadatas(buffer: Buffer, blockMetadatas: BlockMetadata[], offset: number): void {
    for (let i = 0; i < blockMetadatas.length; i++) {
      const block = blockMetadatas[i];
      const pos = offset + i * 24;
      buffer.writeUInt32LE(block.file_id, pos);
      buffer.writeUInt32LE(block.lineno, pos + 4);
      buffer.writeUInt32LE(block.start_char, pos + 8);
      buffer.writeBigUInt64LE(BigInt(block.text_offset), pos + 12);
      buffer.writeUInt32LE(block.text_len, pos + 20);
    }
  }

  private writeStringHeap(buffer: Buffer, stringHeap: string[], offset: number): void {
    let currentOffset = offset;
    for (const str of stringHeap) {
      const bytes = Buffer.from(str, 'utf8');
      bytes.copy(buffer, currentOffset);
      currentOffset += bytes.length;
    }
  }

  private writeVectors(buffer: Buffer, vectors: number[][], offset: number): void {
    let currentOffset = offset;
    for (const vector of vectors) {
      const float32Array = new Float32Array(vector);
      const vectorBuffer = Buffer.from(float32Array.buffer);
      vectorBuffer.copy(buffer, currentOffset);
      currentOffset += vectorBuffer.length;
    }
  }

  private parseHeader(buffer: Buffer): IndexHeader {
    return {
      magic_number: buffer.readUInt32LE(0),
      version: buffer.readUInt32LE(4),
      vector_dim: buffer.readUInt32LE(8),
      total_vectors: Number(buffer.readBigUInt64LE(12)),
      total_files: Number(buffer.readBigUInt64LE(20)),
      offset_files: Number(buffer.readBigUInt64LE(28)),
      offset_blocks: Number(buffer.readBigUInt64LE(36)),
      offset_strings: Number(buffer.readBigUInt64LE(44)),
      offset_vectors: Number(buffer.readBigUInt64LE(52)),
      offset_ann: Number(buffer.readBigUInt64LE(60)),
      ann_size: Number(buffer.readBigUInt64LE(68)), // Read ann_size
      ef_search: Number(buffer.readBigUInt64LE(76)) // Read ef_search
    };
  }

  private parseFileInfos(buffer: Buffer, totalFiles: number): FileInfo[] {
    const fileInfos: FileInfo[] = [];
    for (let i = 0; i < totalFiles; i++) {
      const pos = i * 32;
      fileInfos.push({
        mtime: Number(buffer.readBigUInt64LE(pos)),
        size: Number(buffer.readBigUInt64LE(pos + 8)),
        path_offset: Number(buffer.readBigUInt64LE(pos + 16)),
        first_vector_id: buffer.readUInt32LE(pos + 24),
        num_vectors: buffer.readUInt32LE(pos + 28)
      });
    }
    return fileInfos;
  }

  private parseBlockMetadatas(buffer: Buffer, totalVectors: number): BlockMetadata[] {
    const blockMetadatas: BlockMetadata[] = [];
    for (let i = 0; i < totalVectors; i++) {
      const pos = i * 24;
      blockMetadatas.push({
        file_id: buffer.readUInt32LE(pos),
        lineno: buffer.readUInt32LE(pos + 4),
        start_char: buffer.readUInt32LE(pos + 8),
        text_offset: Number(buffer.readBigUInt64LE(pos + 12)),
        text_len: buffer.readUInt32LE(pos + 20)
      });
    }
    return blockMetadatas;
  }

  private parseVectors(buffer: Buffer, totalVectors: number, vectorDim: number): number[][] {
    const vectors: number[][] = [];
    for (let i = 0; i < totalVectors; i++) {
      const pos = i * vectorDim * 4;
      const vectorBuffer = buffer.slice(pos, pos + vectorDim * 4);
      const float32Array = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorDim);
      vectors.push(Array.from(float32Array));
    }
    return vectors;
  }

  private calculateStringHeapSize(stringHeap: string[]): number {
    return stringHeap.reduce((size, str) => size + Buffer.byteLength(str, 'utf8'), 0);
  }

  private calculateHNSWSize(graph: HNSWGraph): number {
    let size = 24; // Header: max_level, entry_point, m, ef_construction, ef_search, node_count
    size += graph.nodes.length * 8; // Each node: id, level
    
    for (const node of graph.nodes) {
      for (let level = 0; level <= graph.max_level; level++) {
        const neighbors = node.neighbors[level] || [];
        size += 4; // neighbor_count
        size += neighbors.length * 4; // neighbor_ids
      }
    }
    
    return size;
  }

  private buildHNSWIndex(vectors: number[][], onProgress?: (current: number, total: number) => void): HNSWGraph {
    if (vectors.length === 0) {
      return {
        nodes: [],
        max_level: 0,
        entry_point: 0,
        m: 16,
        ef_construction: 200,
        ef_search: 50
      };
    }

    if (vectors.length < 100) {
      return {
        nodes: [],
        max_level: 0,
        entry_point: 0,
        m: 16,
        ef_construction: 200,
        ef_search: 50
      };
    }

    const m = Math.min(16, Math.max(4, Math.floor(Math.log(vectors.length) / Math.log(4))));
    const ef_construction = Math.min(200, Math.max(50, vectors.length / 10));
    const ef_search = 50;
    const max_level = Math.max(0, Math.floor(Math.log(vectors.length) / Math.log(m)));

    const nodes: HNSWNode[] = [];
    for (let i = 0; i < vectors.length; i++) {
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

    const batchSize = Math.max(1, Math.floor(vectors.length / 50));
    for (let i = 1; i < vectors.length; i++) {
      this.insertIntoHNSW(graph, vectors, i);
      
      if (i % batchSize === 0) {
        onProgress?.(i, vectors.length);
      }
    }

    return graph;
  }

  private insertIntoHNSW(graph: HNSWGraph, vectors: number[][], vectorId: number): void {
    const queryVector = vectors[vectorId];
    const node = graph.nodes[vectorId];
    const currentLevel = node.level;

    let currentEntryPoint = graph.entry_point;
    let currentMaxLevel = graph.nodes[currentEntryPoint].level;

    for (let level = currentMaxLevel; level > currentLevel; level--) {
      const neighbors = this.searchLayer(graph, vectors, queryVector, [currentEntryPoint], 1, level);
      if (neighbors.length > 0) {
        currentEntryPoint = neighbors[0];
      }
    }

    for (let level = Math.min(currentLevel, currentMaxLevel); level >= 0; level--) {
      const ef = Math.min(graph.ef_construction, Math.max(10, graph.nodes.length / 20));
      const neighbors = this.searchLayer(graph, vectors, queryVector, [currentEntryPoint], ef, level);
      const selectedNeighbors = this.selectNeighbors(graph, vectors, queryVector, neighbors, graph.m, level);
      
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

  private searchLayer(graph: HNSWGraph, vectors: number[][], queryVector: number[], entryPoints: number[], ef: number, level: number): number[] {
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
        const distance = this.cosineDistance(queryVector, vectors[candidate]);
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

  private selectNeighbors(graph: HNSWGraph, vectors: number[][], queryVector: number[], candidates: number[], m: number, level: number): number[] {
    const distances = candidates.map(id => ({
      id,
      distance: this.cosineDistance(queryVector, vectors[id])
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

  private async generateSha(relpath: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(relpath).digest('hex').substring(0, 12);
  }

  private async loadVector(vectorId: number, fileHandle: fs.FileHandle, header: IndexHeader): Promise<number[]> {
    const vectorBuffer = Buffer.alloc(header.vector_dim * 4);
    const vectorOffset = header.offset_vectors + (vectorId * header.vector_dim * 4);
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

      const fileInfosBuffer = Buffer.alloc(header.total_files * 32);
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

    const allFileIndices = await this.loadAllFileIndicesExcept(toRemove);
    allFileIndices.push(...newFileIndices);
    
    await this.saveIndex(allFileIndices, onProgress);
  }

  private async loadAllFileIndicesExcept(excludePaths: Set<string>): Promise<FileIndex[]> {
    const fileHandle = await fs.open(this.indexPath, 'r');
    try {
      const headerBuffer = Buffer.alloc(HEADER_SIZE);
      await fileHandle.read(headerBuffer, 0, HEADER_SIZE, 0);
      const header = this.parseHeader(headerBuffer);

      const fileInfosBuffer = Buffer.alloc(header.total_files * 32);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const blocksBuffer = Buffer.alloc(header.total_vectors * 24);
      await fileHandle.read(blocksBuffer, 0, blocksBuffer.length, header.offset_blocks);
      const blockMetadatas = this.parseBlockMetadatas(blocksBuffer, header.total_vectors);

      const stringHeapSize = header.offset_vectors - header.offset_strings;
      const stringHeapBuffer = Buffer.alloc(stringHeapSize);
      await fileHandle.read(stringHeapBuffer, 0, stringHeapSize, header.offset_strings);

      const fileIndices: FileIndex[] = [];
      
      for (let fileId = 0; fileId < fileInfos.length; fileId++) {
        const fileInfo = fileInfos[fileId];
        const relpath = this.extractStringFromHeap(stringHeapBuffer, fileInfo.path_offset);
        
        if (excludePaths.has(relpath)) {
          continue;
        }

        const units = [];
        const embeddings = [];
        
        for (let i = 0; i < fileInfo.num_vectors; i++) {
          const vectorId = fileInfo.first_vector_id + i;
          const block = blockMetadatas[vectorId];
          
          const text = this.extractStringFromHeap(stringHeapBuffer, block.text_offset, block.text_len);
          units.push({
            id: `${relpath}:${block.lineno}:${block.start_char}`,
            relpath,
            text,
            lineno: block.lineno,
            start_char: block.start_char
          });

          const vector = await this.loadVector(vectorId, fileHandle, header);
          embeddings.push(vector);
        }

        const sha = await this.generateSha(relpath);
          
        fileIndices.push({
          sha,
          relpath,
          mtime: new Date(fileInfo.mtime * 1000),
          size: fileInfo.size,
          units,
          embeddings
        });
      }

      return fileIndices;
    } finally {
      await fileHandle.close();
    }
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
        return [];
      }

      const candidates = await this.searchLayerWithFileAccess(graph, queryVector, [graph.entry_point], header.ef_search || 50, 0, fileHandle, header);
      const topCandidates = await this.selectNeighborsWithFileAccess(queryVector, candidates, topK, fileHandle, header);

      const fileInfosBuffer = Buffer.alloc(header.total_files * 32);
      await fileHandle.read(fileInfosBuffer, 0, fileInfosBuffer.length, header.offset_files);
      const fileInfos = this.parseFileInfos(fileInfosBuffer, header.total_files);

      const blocksBuffer = Buffer.alloc(header.total_vectors * 24);
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

}
