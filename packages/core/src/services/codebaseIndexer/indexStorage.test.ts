/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { IndexStorage } from './indexStorage.js';
import { FileIndex, TextUnit } from './types.js';

describe('IndexStorage', () => {
  let tempDir: string;
  let storage: IndexStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'index-storage-test-'));
    storage = new IndexStorage(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('binary vector storage', () => {
    it('should save and load vectors in binary format', async () => {
      const testEmbeddings: number[][] = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9]
      ];

      const testUnits: TextUnit[] = [
        { id: '1', text: 'test1', lineno: 1, start_char: 0, relpath: 'test1.txt' },
        { id: '2', text: 'test2', lineno: 2, start_char: 0, relpath: 'test2.txt' },
        { id: '3', text: 'test3', lineno: 3, start_char: 0, relpath: 'test3.txt' }
      ];

      const fileIndex: FileIndex = {
        sha: 'test-sha',
        relpath: 'test.txt',
        units: testUnits,
        embeddings: testEmbeddings,
        mtime: new Date(),
        size: 100
      };

      await storage.createIndexDirectory();
      await storage.saveFileIndex(fileIndex);

      // Get the actual SHA that was generated
      const actualSha = await storage['generateSha']('test.txt');
      
      // Check that .bin file was created instead of .npy
      const binPath = path.join(tempDir, '.index', `${actualSha}.bin`);
      const metaPath = path.join(tempDir, '.index', `${actualSha}.meta.jsonl`);
      const infoPath = path.join(tempDir, '.index', `${actualSha}.info.json`);

      expect(await fs.access(binPath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(metaPath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(infoPath).then(() => true).catch(() => false)).toBe(true);

      // Load the file index
      const loadedIndex = await storage.loadFileIndex('test.txt');
      expect(loadedIndex).not.toBeNull();
      
      // Check embeddings with tolerance for float precision
      expect(loadedIndex!.embeddings.length).toBe(testEmbeddings.length);
      for (let i = 0; i < testEmbeddings.length; i++) {
        expect(loadedIndex!.embeddings[i].length).toBe(testEmbeddings[i].length);
        for (let j = 0; j < testEmbeddings[i].length; j++) {
          expect(loadedIndex!.embeddings[i][j]).toBeCloseTo(testEmbeddings[i][j], 6);
        }
      }
      
      expect(loadedIndex!.units).toEqual(testUnits);
    });

    it('should handle empty embeddings array', async () => {
      const testEmbeddings: number[][] = [];
      const testUnits: TextUnit[] = [];

      const fileIndex: FileIndex = {
        sha: 'test-sha-empty',
        relpath: 'test-empty.txt',
        units: testUnits,
        embeddings: testEmbeddings,
        mtime: new Date(),
        size: 0
      };

      await storage.createIndexDirectory();
      await storage.saveFileIndex(fileIndex);

      const loadedIndex = await storage.loadFileIndex('test-empty.txt');
      expect(loadedIndex).not.toBeNull();
      expect(loadedIndex!.embeddings).toEqual([]);
      expect(loadedIndex!.units).toEqual([]);
    });

    it('should be more efficient than JSON storage', async () => {
      // Create a large embedding array
      const largeEmbeddings: number[][] = [];
      for (let i = 0; i < 100; i++) {
        const vector: number[] = [];
        for (let j = 0; j < 1536; j++) {
          vector.push(Math.random());
        }
        largeEmbeddings.push(vector);
      }

      const testUnits: TextUnit[] = largeEmbeddings.map((_, i) => ({
        id: `${i}`,
        text: `test${i}`,
        lineno: i + 1,
        start_char: 0,
        relpath: `test${i}.txt`
      }));

      const fileIndex: FileIndex = {
        sha: 'test-sha-large',
        relpath: 'test-large.txt',
        units: testUnits,
        embeddings: largeEmbeddings,
        mtime: new Date(),
        size: 1000
      };

      await storage.createIndexDirectory();
      await storage.saveFileIndex(fileIndex);

      // Get the actual SHA that was generated
      const actualSha = await storage['generateSha']('test-large.txt');
      
      // Check file size - binary should be smaller than JSON
      const binPath = path.join(tempDir, '.index', `${actualSha}.bin`);
      const binStats = await fs.stat(binPath);
      
      // Binary size should be approximately: 8 bytes header + 100 * 1536 * 4 bytes data
      const expectedBinarySize = 8 + 100 * 1536 * 4; // ~614KB
      expect(binStats.size).toBeLessThan(expectedBinarySize + 1000); // Allow some tolerance
      expect(binStats.size).toBeGreaterThan(expectedBinarySize - 1000);
    });
  });
});
