/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

import fs from 'node:fs';
import * as actualNodeFs from 'node:fs'; // For setup/teardown
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import mime from 'mime/lite';

import {
  isWithinRoot,
  isBinaryFile,
  detectFileType,
  processSingleFileContent,
  detectBOM,
  readFileWithEncoding,
  readWasmBinaryFromDisk,
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
  getRealPath,
  isEmpty,
} from './fileUtils.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { ToolErrorType } from '../tools/tool-error.js';

vi.mock('mime/lite', () => ({
  default: { getType: vi.fn() },
  getType: vi.fn(),
}));

const mockMimeGetType = mime.getType as Mock;

describe('fileUtils', () => {
  let tempRootDir: string;
  const originalProcessCwd = process.cwd;

  let testTextFilePath: string;
  let testImageFilePath: string;
  let testPdfFilePath: string;
  let testAudioFilePath: string;
  let testBinaryFilePath: string;
  let nonexistentFilePath: string;
  let directoryPath: string;

  beforeEach(() => {
    vi.resetAllMocks(); // Reset all mocks, including mime.getType

    tempRootDir = actualNodeFs.mkdtempSync(
      path.join(os.tmpdir(), 'fileUtils-test-'),
    );
    process.cwd = vi.fn(() => tempRootDir); // Mock cwd if necessary for relative path logic within tests

    testTextFilePath = path.join(tempRootDir, 'test.txt');
    testImageFilePath = path.join(tempRootDir, 'image.png');
    testPdfFilePath = path.join(tempRootDir, 'document.pdf');
    testAudioFilePath = path.join(tempRootDir, 'audio.mp3');
    testBinaryFilePath = path.join(tempRootDir, 'app.exe');
    nonexistentFilePath = path.join(tempRootDir, 'nonexistent.txt');
    directoryPath = path.join(tempRootDir, 'subdir');

    actualNodeFs.mkdirSync(directoryPath, { recursive: true }); // Ensure subdir exists
  });

  afterEach(() => {
    if (actualNodeFs.existsSync(tempRootDir)) {
      actualNodeFs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    process.cwd = originalProcessCwd;
    vi.restoreAllMocks(); // Restore any spies
  });

  describe('readWasmBinaryFromDisk', () => {
    it('loads a WASM binary from disk as a Uint8Array', async () => {
      const wasmFixtureUrl = new URL(
        './__fixtures__/dummy.wasm',
        import.meta.url,
      );
      const wasmFixturePath = fileURLToPath(wasmFixtureUrl);
      const result = await readWasmBinaryFromDisk(wasmFixturePath);
      const expectedBytes = new Uint8Array(
        await fsPromises.readFile(wasmFixturePath),
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(expectedBytes);
    });
  });

  describe('detectBOM', () => {
    it('detects UTF-8 BOM', () => {
      const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]);
      expect(detectBOM(buf)).toEqual({ encoding: 'utf8', bomLength: 3 });
    });

    it('detects UTF-16 LE BOM', () => {
      const buf = Buffer.from([0xff, 0xfe, 0x61, 0x00]);
      expect(detectBOM(buf)).toEqual({ encoding: 'utf16le', bomLength: 2 });
    });

    it('detects UTF-16 BE BOM', () => {
      const buf = Buffer.from([0xfe, 0xff, 0x00, 0x61]);
      expect(detectBOM(buf)).toEqual({ encoding: 'utf16be', bomLength: 2 });
    });

    it('detects UTF-32 LE BOM', () => {
      const buf = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00]);
      expect(detectBOM(buf)).toEqual({ encoding: 'utf32le', bomLength: 4 });
    });

    it('detects UTF-32 BE BOM', () => {
      const buf = Buffer.from([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x61]);
      expect(detectBOM(buf)).toEqual({ encoding: 'utf32be', bomLength: 4 });
    });

    it('returns null for no BOM', () => {
      const buf = Buffer.from([0x61, 0x62, 0x63]);
      expect(detectBOM(buf)).toBeNull();
    });
  });

  describe('readFileWithEncoding', () => {
    it('reads UTF-8 file without BOM', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'hello');
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hello');
    });

    it('reads UTF-8 file with BOM', async () => {
      const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hi');
    });

    it('reads UTF-16 LE file with BOM', async () => {
      const buf = Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hi');
    });

    it('reads UTF-16 BE file with BOM', async () => {
      const buf = Buffer.from([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hi');
    });

    it('reads UTF-32 LE file with BOM', async () => {
      const buf = Buffer.from([
        0xff, 0xfe, 0x00, 0x00, 0x68, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00,
      ]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hi');
    });

    it('reads UTF-32 BE file with BOM', async () => {
      const buf = Buffer.from([
        0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x68, 0x00, 0x00, 0x00, 0x69,
      ]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await readFileWithEncoding(testTextFilePath)).toBe('hi');
    });
  });

  describe('isWithinRoot', () => {
    it('should return true if path is within root', () => {
      const root = '/path/to/project';
      const file = '/path/to/project/src/index.js';
      expect(isWithinRoot(file, root)).toBe(true);
    });

    it('should return true if path is root itself', () => {
      const root = '/path/to/project';
      expect(isWithinRoot(root, root)).toBe(true);
    });

    it('should return false if path is outside root', () => {
      const root = '/path/to/project';
      const file = '/path/to/other/project/src/index.js';
      expect(isWithinRoot(file, root)).toBe(false);
    });

    it('should handle trailing separators in root', () => {
      const root = '/path/to/project/';
      const file = '/path/to/project/src/index.js';
      expect(isWithinRoot(file, root)).toBe(true);
    });

    it('should handle relative paths and resolve them', () => {
      const root = './project';
      const file = './project/src/index.js';
      // Resolving against process.cwd which is mocked in beforeEach
      const resolvedRoot = path.resolve(tempRootDir, root);
      const resolvedFile = path.resolve(tempRootDir, file);
      expect(isWithinRoot(resolvedFile, resolvedRoot)).toBe(true);
    });
  });

  describe('isEmpty', () => {
    it('returns true for 0-byte file', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, '');
      expect(await isEmpty(testTextFilePath)).toBe(true);
    });

    it('returns true for whitespace-only file', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, '   \n \r\t  ');
      expect(await isEmpty(testTextFilePath)).toBe(true);
    });

    it('returns true for UTF-8 BOM + whitespace', async () => {
      const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x20, 0x0a]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await isEmpty(testTextFilePath)).toBe(true);
    });

    it('returns false for file with content', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'hello');
      expect(await isEmpty(testTextFilePath)).toBe(false);
    });

    it('returns true if file is missing', async () => {
      expect(await isEmpty(nonexistentFilePath)).toBe(true);
    });
  });

  describe('isBinaryFile', () => {
    it('should return false for an empty file', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, '');
      expect(await isBinaryFile(testTextFilePath)).toBe(false);
    });

    it('should return false for a plain text file', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'This is some plain text.');
      expect(await isBinaryFile(testTextFilePath)).toBe(false);
    });

    it('should return true for a file with null bytes', async () => {
      const content = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x21]);
      actualNodeFs.writeFileSync(testBinaryFilePath, content);
      expect(await isBinaryFile(testBinaryFilePath)).toBe(true);
    });

    it('should return true for a file with high non-printable character ratio', async () => {
      const content = Buffer.alloc(100);
      for (let i = 0; i < 40; i++) {
        content[i] = 1; // Non-printable SOH
      }
      actualNodeFs.writeFileSync(testBinaryFilePath, content);
      expect(await isBinaryFile(testBinaryFilePath)).toBe(true);
    });

    it('should return false for a UTF-16 LE file with BOM', async () => {
      const buf = Buffer.from([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
      actualNodeFs.writeFileSync(testTextFilePath, buf);
      expect(await isBinaryFile(testTextFilePath)).toBe(false);
    });
  });

  describe('detectFileType', () => {
    it("should return 'text' for .ts file", async () => {
      const tsFilePath = path.join(tempRootDir, 'script.ts');
      actualNodeFs.writeFileSync(tsFilePath, 'console.log("hello");');
      expect(await detectFileType(tsFilePath)).toBe('text');
    });

    it("should return 'image' for .png file", async () => {
      mockMimeGetType.mockReturnValue('image/png');
      actualNodeFs.writeFileSync(testImageFilePath, 'fake-image-data');
      expect(await detectFileType(testImageFilePath)).toBe('image');
    });

    it("should return 'pdf' for .pdf file", async () => {
      mockMimeGetType.mockReturnValue('application/pdf');
      actualNodeFs.writeFileSync(testPdfFilePath, 'fake-pdf-data');
      expect(await detectFileType(testPdfFilePath)).toBe('pdf');
    });

    it("should return 'audio' for .mp3 file", async () => {
      mockMimeGetType.mockReturnValue('audio/mpeg');
      // Mock isBinaryFile to return true to confirm it's recognized as audio
      vi.spyOn(actualNodeFs.promises, 'open').mockImplementation(
        async () =>
          ({
            stat: async () => ({ size: 100 }),
            read: async (buf: Buffer) => {
              buf[0] = 0x00; // null byte to make it look binary
              return { bytesRead: 1 };
            },
            close: async () => {},
          }) as unknown as fs.promises.FileHandle,
      );

      actualNodeFs.writeFileSync(testAudioFilePath, 'fake-audio-data');
      expect(await detectFileType(testAudioFilePath)).toBe('audio');
    });

    it("should return 'text' for audio extension with text content", async () => {
      mockMimeGetType.mockReturnValue('audio/mpeg');
      // No null bytes, should be text
      actualNodeFs.writeFileSync(testAudioFilePath, 'Not really audio');
      expect(await detectFileType(testAudioFilePath)).toBe('text');
    });

    it("should return 'binary' for known binary extension", async () => {
      const exeFilePath = path.join(tempRootDir, 'app.exe');
      actualNodeFs.writeFileSync(exeFilePath, 'fake-exe-data');
      expect(await detectFileType(exeFilePath)).toBe('binary');
    });

    it("should return 'binary' for unknown extension with binary content", async () => {
      const unknownFilePath = path.join(tempRootDir, 'file.dat');
      const content = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      actualNodeFs.writeFileSync(unknownFilePath, content);
      expect(await detectFileType(unknownFilePath)).toBe('binary');
    });

    it("should return 'svg' for .svg extension", async () => {
      const svgPath = path.join(tempRootDir, 'icon.svg');
      actualNodeFs.writeFileSync(svgPath, '<svg></svg>');
      expect(await detectFileType(svgPath)).toBe('svg');
    });
  });

  describe('processSingleFileContent', () => {
    beforeEach(() => {
      // Ensure files exist for statSync checks before readFile might be mocked
      if (actualNodeFs.existsSync(testTextFilePath))
        actualNodeFs.unlinkSync(testTextFilePath);
      if (actualNodeFs.existsSync(testImageFilePath))
        actualNodeFs.unlinkSync(testImageFilePath);
      if (actualNodeFs.existsSync(testPdfFilePath))
        actualNodeFs.unlinkSync(testPdfFilePath);
      if (actualNodeFs.existsSync(testAudioFilePath))
        actualNodeFs.unlinkSync(testAudioFilePath);
      if (actualNodeFs.existsSync(testBinaryFilePath))
        actualNodeFs.unlinkSync(testBinaryFilePath);
    });

    it('should read a text file successfully', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      actualNodeFs.writeFileSync(testTextFilePath, content);
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.llmContent).toBe(content);
      expect(result.returnDisplay).toBe('');
      expect(result.error).toBeUndefined();
    });

    it('should read all lines when full flag is true', async () => {
      // Create a file with more than DEFAULT_MAX_LINES_TEXT_FILE lines (2000 lines)
      const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      actualNodeFs.writeFileSync(testTextFilePath, content);

      // Without full flag, it should be truncated
      const truncatedResult = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(truncatedResult.originalLineCount).toBe(2500);
      expect(truncatedResult.isTruncated).toBe(true);
      expect(
        (truncatedResult.llmContent as string).split('\n').length,
      ).toBeLessThan(2500);

      // With full flag, it should return all lines
      const fullResult = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        undefined,
        undefined,
        true,
      );
      expect(fullResult.originalLineCount).toBe(2500);
      expect(fullResult.isTruncated).toBe(false);
      expect((fullResult.llmContent as string).split('\n').length).toBe(2500);
    });

    it('should handle file not found', async () => {
      const result = await processSingleFileContent(
        nonexistentFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toBe('File not found.');
      expect(result.errorType).toBe(ToolErrorType.FILE_NOT_FOUND);
    });

    it('should handle directory path', async () => {
      const result = await processSingleFileContent(
        directoryPath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toBe('Path is a directory.');
      expect(result.errorType).toBe(ToolErrorType.TARGET_IS_DIRECTORY);
    });

    it('should handle large file error', async () => {
      // Ensure file exists so it doesn't fail on existsSync check
      actualNodeFs.writeFileSync(testTextFilePath, 'some content');
      // Mock stat to return a large size
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        size: 30 * 1024 * 1024,
        isDirectory: () => false,
      } as unknown as fs.Stats);

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toMatch(/File size exceeds the .*MB limit/);
      expect(result.errorType).toBe(ToolErrorType.FILE_TOO_LARGE);
    });

    it('should handle binary file', async () => {
      const content = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      actualNodeFs.writeFileSync(testBinaryFilePath, content);
      const result = await processSingleFileContent(
        testBinaryFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toContain('Skipped binary file');
      expect(result.llmContent).toContain(
        'Cannot display content of binary file',
      );
    });

    it('should handle image file', async () => {
      mockMimeGetType.mockReturnValue('image/png');
      const content = Buffer.from('fake-image-data');
      actualNodeFs.writeFileSync(testImageFilePath, content);
      const result = await processSingleFileContent(
        testImageFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toContain('Read image file');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(content.toString('base64'));
      expect(
        (result.llmContent as { inlineData: { mimeType: string } }).inlineData
          .mimeType,
      ).toBe('image/png');
    });

    it('should handle PDF file', async () => {
      mockMimeGetType.mockReturnValue('application/pdf');
      const content = Buffer.from('fake-pdf-data');
      actualNodeFs.writeFileSync(testPdfFilePath, content);
      const result = await processSingleFileContent(
        testPdfFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.returnDisplay).toContain('Read pdf file');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(content.toString('base64'));
    });

    it('should handle truncation of text files', async () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.isTruncated).toBe(true);
      expect(result.originalLineCount).toBe(3000);
      expect(result.linesShown).toEqual([1, 2000]);
    });

    it('should read a specific line range', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        10,
        20,
      );
      expect(result.originalLineCount).toBe(100);
      expect(result.linesShown).toEqual([10, 20]);
      const contentLines = (result.llmContent as string).split('\n');
      expect(contentLines.length).toBe(11);
      expect(contentLines[0]).toBe('Line 10');
      expect(contentLines[10]).toBe('Line 20');
    });

    it('should handle SVG file as text', async () => {
      const svgContent = '<svg><rect/></svg>';
      const svgPath = path.join(tempRootDir, 'test.svg');
      actualNodeFs.writeFileSync(svgPath, svgContent);
      const result = await processSingleFileContent(
        svgPath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.llmContent).toBe(svgContent);
      expect(result.returnDisplay).toContain('Read SVG as text');
    });
  });

  describe('saveTruncatedToolOutput', () => {
    it('saves content to a temporary file', async () => {
      const content = 'large output';
      const { outputFile } = await saveTruncatedToolOutput(
        content,
        'testTool',
        'call123',
        tempRootDir,
      );
      expect(actualNodeFs.existsSync(outputFile)).toBe(true);
      expect(actualNodeFs.readFileSync(outputFile, 'utf8')).toBe(content);
      expect(outputFile).toContain('testtool_call123.txt');
    });

    it('handles session ID in path', async () => {
      const content = 'session content';
      const { outputFile } = await saveTruncatedToolOutput(
        content,
        'testTool',
        'call123',
        tempRootDir,
        'session-456',
      );
      // sanitization of 'session-456' results in 'session-456'
      expect(outputFile).toContain('session-session-456');
      expect(actualNodeFs.readFileSync(outputFile, 'utf8')).toBe(content);
    });
  });

  describe('formatTruncatedToolOutput', () => {
    it('does not truncate if within limit', () => {
      const content = 'short';
      expect(formatTruncatedToolOutput(content, 'out.txt', 100)).toBe(content);
    });

    it('truncates content and adds link to file', () => {
      const content = 'A'.repeat(1000);
      const result = formatTruncatedToolOutput(content, 'out.txt', 100);
      expect(result).toContain('Output too large');
      expect(result).toContain('out.txt');
      expect(result).toContain('characters omitted');
    });
  });

  describe('getRealPath', () => {
    it('returns real path for existing file', () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'test');
      const real = getRealPath(testTextFilePath);
      expect(path.isAbsolute(real)).toBe(true);
    });

    it('returns resolved path for non-existent file', () => {
      const real = getRealPath(nonexistentFilePath);
      expect(real).toBe(path.resolve(nonexistentFilePath));
    });
  });
});
