/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  isBinaryFileElegant,
  isBinaryFileElegantSync,
  isTextFileElegant,
  isTextFileElegantSync,
} from './binaryFileUtils.js';

describe('binaryFileUtils', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'binary-file-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isBinaryFileElegant', () => {
    it('should detect text files as non-binary', async () => {
      const textFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(textFile, 'Hello, world!\nThis is a text file.');

      const result = await isBinaryFileElegant(textFile);
      expect(result).toBe(false);
    });

    it('should detect JavaScript files as non-binary', async () => {
      const jsFile = path.join(tempDir, 'test.js');
      await fs.writeFile(jsFile, 'console.log("Hello, world!");\nconst x = 42;');

      const result = await isBinaryFileElegant(jsFile);
      expect(result).toBe(false);
    });

    it('should detect JSON files as non-binary', async () => {
      const jsonFile = path.join(tempDir, 'test.json');
      await fs.writeFile(jsonFile, '{"name": "test", "value": 42}');

      const result = await isBinaryFileElegant(jsonFile);
      expect(result).toBe(false);
    });

    it('should detect files with null bytes as binary', async () => {
      const binaryFile = path.join(tempDir, 'test.bin');
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64]); // "Hello\0world"
      await fs.writeFile(binaryFile, buffer);

      const result = await isBinaryFileElegant(binaryFile);
      expect(result).toBe(true);
    });

    it('should handle empty files gracefully', async () => {
      const emptyFile = path.join(tempDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');

      const result = await isBinaryFileElegant(emptyFile);
      expect(result).toBe(false); // Пустые файлы считаются текстовыми
    });

    it('should handle non-existent files gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.txt');

      const result = await isBinaryFileElegant(nonExistentFile);
      expect(result).toBe(false); // Возвращаем false для несуществующих файлов
    });
  });

  describe('isBinaryFileElegantSync', () => {
    it('should detect text files as non-binary (sync)', async () => {
      const textFile = path.join(tempDir, 'test-sync.txt');
      await fs.writeFile(textFile, 'Hello, world!\nThis is a text file.');

      const result = isBinaryFileElegantSync(textFile);
      expect(result).toBe(false);
    });

    it('should detect files with null bytes as binary (sync)', async () => {
      const binaryFile = path.join(tempDir, 'test-sync.bin');
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
      await fs.writeFile(binaryFile, buffer);

      const result = isBinaryFileElegantSync(binaryFile);
      expect(result).toBe(true);
    });
  });

  describe('isTextFileElegant', () => {
    it('should detect text files as text', async () => {
      const textFile = path.join(tempDir, 'test-text.txt');
      await fs.writeFile(textFile, 'Hello, world!\nThis is a text file.');

      const result = await isTextFileElegant(textFile);
      expect(result).toBe(true);
    });

    it('should detect binary files as non-text', async () => {
      const binaryFile = path.join(tempDir, 'test-text.bin');
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
      await fs.writeFile(binaryFile, buffer);

      const result = await isTextFileElegant(binaryFile);
      expect(result).toBe(false);
    });
  });

  describe('isTextFileElegantSync', () => {
    it('should detect text files as text (sync)', async () => {
      const textFile = path.join(tempDir, 'test-text-sync.txt');
      await fs.writeFile(textFile, 'Hello, world!\nThis is a text file.');

      const result = isTextFileElegantSync(textFile);
      expect(result).toBe(true);
    });

    it('should detect binary files as non-text (sync)', async () => {
      const binaryFile = path.join(tempDir, 'test-text-sync.bin');
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
      await fs.writeFile(binaryFile, buffer);

      const result = isTextFileElegantSync(binaryFile);
      expect(result).toBe(false);
    });
  });
});
