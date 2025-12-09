/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileWithEncoding } from './fileUtils.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ISO-8859-1 Encoding Support', () => {
  let tmpDir: string;
  let filePath: string;
  const fileService = new StandardFileSystemService();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-iso-test-'));
    filePath = path.join(tmpDir, 'test.txt');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read ISO-8859-1 file correctly', async () => {
    // "café na manhã" in ISO-8859-1
    // c a f é _ n a _ m a n h ã
    // 63 61 66 e9 20 6e 61 20 6d 61 6e 68 e3
    const buffer = Buffer.from([
      0x63, 0x61, 0x66, 0xe9, 0x20, 0x6e, 0x61, 0x20, 0x6d, 0x61, 0x6e, 0x68,
      0xe3,
    ]);
    fs.writeFileSync(filePath, buffer);

    const content = await readFileWithEncoding(filePath);
    expect(content).toBe('café na manhã');
  });

  it('should preserve ISO-8859-1 encoding when writing', async () => {
    // "café na manhã"
    const buffer = Buffer.from([
      0x63, 0x61, 0x66, 0xe9, 0x20, 0x6e, 0x61, 0x20, 0x6d, 0x61, 0x6e, 0x68,
      0xe3,
    ]);
    fs.writeFileSync(filePath, buffer);

    // Verify initial read
    const content = await readFileWithEncoding(filePath);
    expect(content).toBe('café na manhã');

    // Write new content "café na manhã updated"
    await fileService.writeTextFile(filePath, 'café na manhã updated');

    // Read back as buffer to check encoding
    const newBuffer = fs.readFileSync(filePath);

    // Expect "café na manhã updated" in ISO-8859-1
    // Original: 13 bytes. " updated": 8 bytes. Total 21 bytes.
    expect(newBuffer.length).toBe(21);

    const str = newBuffer.toString('latin1');
    expect(str).toBe('café na manhã updated');
  });

  it('should fallback to UTF-8 for new files', async () => {
    const newFilePath = path.join(tmpDir, 'new.txt');
    await fileService.writeTextFile(newFilePath, 'café');

    const buffer = fs.readFileSync(newFilePath);
    // UTF-8 for é is C3 A9. Total 5 bytes.
    expect(buffer.length).toBe(5);
    expect(buffer.includes(0xc3)).toBe(true);
  });
});
