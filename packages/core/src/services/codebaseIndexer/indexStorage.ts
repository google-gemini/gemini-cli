/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { FileIndex, IndexStatus, TextUnit } from './types.js';
import { INDEX_DIR } from './constants.js';

export class IndexStorage {
  private readonly indexDir: string;

  constructor(baseDir: string) {
    this.indexDir = path.join(baseDir, INDEX_DIR);
  }

  getBaseDir(): string {
    return path.dirname(this.indexDir);
  }

  async indexExists(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.indexDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async createIndexDirectory(): Promise<void> {
    await fs.mkdir(this.indexDir, { recursive: true });
  }

  async saveFileIndex(fileIndex: FileIndex): Promise<void> {
    const sha = await this.generateSha(fileIndex.relpath);
    const metaPath = path.join(this.indexDir, `${sha}.meta.jsonl`);
    const vecPath = path.join(this.indexDir, `${sha}.bin`);
    const infoPath = path.join(this.indexDir, `${sha}.info.json`);

    const metaContent = fileIndex.units
      .map(unit => JSON.stringify(unit))
      .join('\n');
    await fs.writeFile(metaPath, metaContent, 'utf-8');

    const vectorBuffer = this.embeddingsToBuffer(fileIndex.embeddings);
    await fs.writeFile(vecPath, vectorBuffer);

    const fileInfo = {
      mtime: fileIndex.mtime.toISOString(),
      size: fileIndex.size,
      relpath: fileIndex.relpath
    };
    await fs.writeFile(infoPath, JSON.stringify(fileInfo), 'utf-8');
  }

  async loadFileIndex(relpath: string): Promise<FileIndex | null> {
    const sha = await this.generateSha(relpath);
    const metaPath = path.join(this.indexDir, `${sha}.meta.jsonl`);
    const vecPath = path.join(this.indexDir, `${sha}.bin`);
    const infoPath = path.join(this.indexDir, `${sha}.info.json`);

    try {
      const [metaContent, vecBuffer, infoContent] = await Promise.all([
        fs.readFile(metaPath, 'utf-8'),
        fs.readFile(vecPath),
        fs.readFile(infoPath, 'utf-8')
      ]);

      const units: TextUnit[] = metaContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      const embeddings: number[][] = this.bufferToEmbeddings(vecBuffer);
      const fileInfo = JSON.parse(infoContent);

      return {
        sha,
        relpath,
        units,
        embeddings,
        mtime: new Date(fileInfo.mtime),
        size: fileInfo.size || 0
      };
    } catch {
      return null;
    }
  }

  async fileIndexExists(relpath: string): Promise<boolean> {
    const sha = await this.generateSha(relpath);
    const metaPath = path.join(this.indexDir, `${sha}.meta.jsonl`);
    const vecPath = path.join(this.indexDir, `${sha}.bin`);
    const infoPath = path.join(this.indexDir, `${sha}.info.json`);

    try {
      await Promise.all([
        fs.access(metaPath),
        fs.access(vecPath),
        fs.access(infoPath)
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async getIndexStatus(): Promise<IndexStatus> {
    const exists = await this.indexExists();
    if (!exists) {
      return { exists: false };
    }

    try {
      const manifestPath = path.join(this.indexDir, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      const sizeBytes = await this.calculateDirectorySize(this.indexDir);

      return {
        exists: true,
        fileCount: Object.keys(manifest.files || {}).length,
        vectorCount: manifest.total_vectors || 0,
        lastUpdated: new Date(manifest.generated_at * 1000),
        sizeBytes
      };
    } catch {
      return { exists: true };
    }
  }

  async saveManifest(files: Record<string, any>, totalVectors: number): Promise<void> {
    const manifest = {
      generated_at: Date.now() / 1000,
      total_vectors: totalVectors,
      files
    };

    const manifestPath = path.join(this.indexDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async loadManifest(): Promise<any> {
    const manifestPath = path.join(this.indexDir, 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  }

  async deleteIndex(): Promise<void> {
    if (await this.indexExists()) {
      await fs.rm(this.indexDir, { recursive: true, force: true });
    }
  }

  async deleteFileIndicesBySha(shas: string[]): Promise<void> {
    for (const sha of shas) {
      const metaPath = path.join(this.indexDir, `${sha}.meta.jsonl`);
      const vecPath = path.join(this.indexDir, `${sha}.bin`);
      const infoPath = path.join(this.indexDir, `${sha}.info.json`);

      try {
        await Promise.all([
          fs.unlink(metaPath).catch(() => {}),
          fs.unlink(vecPath).catch(() => {}),
          fs.unlink(infoPath).catch(() => {})
        ]);
      } catch {
      }
    }
  }

  async validateIndexIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      if (!(await this.indexExists())) {
        return { valid: false, errors: ['Index directory does not exist'] };
      }

      const manifest = await this.loadManifest();
      const files = manifest.files || {};
      
      for (const [, fileInfo] of Object.entries(files)) {
        const fileInfoTyped = fileInfo as { meta: string; vec: string; relpath: string; n: number };
        const metaPath = path.join(this.indexDir, fileInfoTyped.meta);
        const vecPath = path.join(this.indexDir, fileInfoTyped.vec);
        
        try {
          await fs.access(metaPath);
        } catch {
          errors.push(`Missing metadata file: ${fileInfoTyped.meta}`);
        }
        
        try {
          await fs.access(vecPath);
        } catch {
          errors.push(`Missing vector file: ${fileInfoTyped.vec}`);
        }
        
        if (errors.length === 0) {
          try {
            const metaContent = await fs.readFile(metaPath, 'utf-8');
            const lines = metaContent.split('\n').filter(line => line.trim());
            
            if (lines.length !== fileInfoTyped.n) {
              errors.push(`Metadata count mismatch for ${fileInfoTyped.relpath}: expected ${fileInfoTyped.n}, got ${lines.length}`);
            }
            
            for (let i = 0; i < lines.length; i++) {
              try {
                JSON.parse(lines[i]);
              } catch {
                errors.push(`Invalid JSON in metadata file ${fileInfoTyped.meta} at line ${i + 1}`);
              }
            }
          } catch (error) {
            errors.push(`Error reading metadata file ${fileInfoTyped.meta}: ${error}`);
          }
        }
      }
      
      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [`Error validating index: ${error}`] };
    }
  }

  async getNewFiles(currentFiles: string[]): Promise<string[]> {
    const manifest = await this.loadManifest().catch(() => ({ files: {} }));
    const indexedFiles = new Set(Object.keys(manifest.files || {}));
    
    const newFiles: string[] = [];
    for (const file of currentFiles) {
      const sha = await this.generateSha(file);
      if (!indexedFiles.has(sha)) {
        newFiles.push(file);
      }
    }
    return newFiles;
  }

  private async generateSha(relpath: string): Promise<string> {
    return crypto.createHash('sha1').update(relpath).digest('hex');
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        }
      }
    } catch {
    }
    
    return totalSize;
  }

  async loadAllVectors(): Promise<{
    vectors: number[][];
    metadata: any[];
  }> {
    const manifest = await this.loadManifest();
    const vectors: number[][] = [];
    const metadata: any[] = [];

    for (const [, fileInfo] of Object.entries(manifest.files)) {
      const fileInfoTyped = fileInfo as { meta: string; vec: string; relpath: string; n: number };
      const metaPath = path.join(this.indexDir, fileInfoTyped.meta);
      const vecPath = path.join(this.indexDir, fileInfoTyped.vec);

      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const fileMetadata = metaContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));

        const vecBuffer = await fs.readFile(vecPath);
        const fileVectors: number[][] = this.bufferToEmbeddings(vecBuffer);

        if (fileMetadata.length !== fileVectors.length) {
          console.warn(`Mismatch in ${fileInfoTyped.relpath}: ${fileMetadata.length} metadata vs ${fileVectors.length} vectors`);
          continue;
        }

        vectors.push(...fileVectors);
        metadata.push(...fileMetadata);
      } catch (error) {
        console.warn(`Error loading vectors for ${fileInfoTyped.relpath}: ${error}`);
      }
    }

    return { vectors, metadata };
  }

  private embeddingsToBuffer(embeddings: number[][]): Buffer {
    if (embeddings.length === 0) {
      return Buffer.alloc(0);
    }

    const vectorCount = embeddings.length;
    const vectorSize = embeddings[0].length;
    
    const headerSize = 8;
    const dataSize = vectorCount * vectorSize * 4;
    const totalSize = headerSize + dataSize;
    
    const buffer = Buffer.alloc(totalSize);
    
    buffer.writeUInt32LE(vectorCount, 0);
    buffer.writeUInt32LE(vectorSize, 4);
    
    const float32Array = new Float32Array(embeddings.flat());
    const dataBuffer = Buffer.from(float32Array.buffer);
    dataBuffer.copy(buffer, headerSize);
    
    return buffer;
  }

  private bufferToEmbeddings(buffer: Buffer): number[][] {
    if (buffer.length === 0) {
      return [];
    }

    const vectorCount = buffer.readUInt32LE(0);
    const vectorSize = buffer.readUInt32LE(4);
    
    const headerSize = 8;
    const dataBuffer = buffer.slice(headerSize);
    const float32Array = new Float32Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.length / 4);
    
    const embeddings: number[][] = [];
    for (let i = 0; i < vectorCount; i++) {
      const start = i * vectorSize;
      const end = start + vectorSize;
      embeddings.push(Array.from(float32Array.slice(start, end)));
    }
    
    return embeddings;
  }
}
