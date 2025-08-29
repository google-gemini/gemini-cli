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

import * as actualNodeFs from 'node:fs'; // For setup/teardown
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mime from 'mime-types';

import {
  isWithinRoot,
  isBinaryFile,
  detectFileType,
  processSingleFileContent,
  detectBOM,
  readFileWithEncoding,
} from './fileUtils.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';

vi.mock('mime-types', () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

const mockMimeLookup = mime.lookup as Mock;

describe('fileUtils', () => {
  let tempRootDir: string;
  const originalProcessCwd = process.cwd;

  let testTextFilePath: string;
  let testImageFilePath: string;
  let testPdfFilePath: string;
  let testBinaryFilePath: string;
  let nonexistentFilePath: string;
  let directoryPath: string;

  beforeEach(() => {
    vi.resetAllMocks(); // Reset all mocks, including mime.lookup

    tempRootDir = actualNodeFs.mkdtempSync(
      path.join(os.tmpdir(), 'fileUtils-test-'),
    );
    process.cwd = vi.fn(() => tempRootDir); // Mock cwd if necessary for relative path logic within tests

    testTextFilePath = path.join(tempRootDir, 'test.txt');
    testImageFilePath = path.join(tempRootDir, 'image.png');
    testPdfFilePath = path.join(tempRootDir, 'document.pdf');
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

  describe('isWithinRoot', () => {
    const root = path.resolve('/project/root');

    it('should return true for paths directly within the root', () => {
      expect(isWithinRoot(path.join(root, 'file.txt'), root)).toBe(true);
      expect(isWithinRoot(path.join(root, 'subdir', 'file.txt'), root)).toBe(
        true,
      );
    });

    it('should return true for the root path itself', () => {
      expect(isWithinRoot(root, root)).toBe(true);
    });

    it('should return false for paths outside the root', () => {
      expect(
        isWithinRoot(path.resolve('/project/other', 'file.txt'), root),
      ).toBe(false);
      expect(isWithinRoot(path.resolve('/unrelated', 'file.txt'), root)).toBe(
        false,
      );
    });

    it('should return false for paths that only partially match the root prefix', () => {
      expect(
        isWithinRoot(
          path.resolve('/project/root-but-actually-different'),
          root,
        ),
      ).toBe(false);
    });

    it('should handle paths with trailing slashes correctly', () => {
      expect(isWithinRoot(path.join(root, 'file.txt') + path.sep, root)).toBe(
        true,
      );
      expect(isWithinRoot(root + path.sep, root)).toBe(true);
    });

    it('should handle different path separators (POSIX vs Windows)', () => {
      const posixRoot = '/project/root';
      const posixPathInside = '/project/root/file.txt';
      const posixPathOutside = '/project/other/file.txt';
      expect(isWithinRoot(posixPathInside, posixRoot)).toBe(true);
      expect(isWithinRoot(posixPathOutside, posixRoot)).toBe(false);
    });

    it('should return false for a root path that is a sub-path of the path to check', () => {
      const pathToCheck = path.resolve('/project/root/sub');
      const rootSub = path.resolve('/project/root');
      expect(isWithinRoot(pathToCheck, rootSub)).toBe(true);

      const pathToCheckSuper = path.resolve('/project/root');
      const rootSuper = path.resolve('/project/root/sub');
      expect(isWithinRoot(pathToCheckSuper, rootSuper)).toBe(false);
    });
  });

  describe('isBinaryFile', () => {
    let filePathForBinaryTest: string;

    beforeEach(() => {
      filePathForBinaryTest = path.join(tempRootDir, 'binaryCheck.tmp');
    });

    afterEach(() => {
      if (actualNodeFs.existsSync(filePathForBinaryTest)) {
        actualNodeFs.unlinkSync(filePathForBinaryTest);
      }
    });

    it('should return false for an empty file', async () => {
      actualNodeFs.writeFileSync(filePathForBinaryTest, '');
      expect(await isBinaryFile(filePathForBinaryTest)).toBe(false);
    });

    it('should return false for a typical text file', async () => {
      actualNodeFs.writeFileSync(
        filePathForBinaryTest,
        'Hello, world!\nThis is a test file with normal text content.',
      );
      expect(await isBinaryFile(filePathForBinaryTest)).toBe(false);
    });

    it('should return true for a file with many null bytes', async () => {
      const binaryContent = Buffer.from([
        0x48, 0x65, 0x00, 0x6c, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]); // "He\0llo\0\0\0\0\0"
      actualNodeFs.writeFileSync(filePathForBinaryTest, binaryContent);
      expect(await isBinaryFile(filePathForBinaryTest)).toBe(true);
    });

    it('should return true for a file with high percentage of non-printable ASCII', async () => {
      const binaryContent = Buffer.from([
        0x41, 0x42, 0x01, 0x02, 0x03, 0x04, 0x05, 0x43, 0x44, 0x06,
      ]); // AB\x01\x02\x03\x04\x05CD\x06
      actualNodeFs.writeFileSync(filePathForBinaryTest, binaryContent);
      expect(await isBinaryFile(filePathForBinaryTest)).toBe(true);
    });

    it('should return false if file access fails (e.g., ENOENT)', async () => {
      // Ensure the file does not exist
      if (actualNodeFs.existsSync(filePathForBinaryTest)) {
        actualNodeFs.unlinkSync(filePathForBinaryTest);
      }
      expect(await isBinaryFile(filePathForBinaryTest)).toBe(false);
    });
  });

  describe('BOM detection and encoding', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await fsPromises.mkdtemp(
        path.join(
          await fsPromises.realpath(os.tmpdir()),
          'fileUtils-bom-test-',
        ),
      );
    });

    afterEach(async () => {
      if (testDir) {
        await fsPromises.rm(testDir, { recursive: true, force: true });
      }
    });

    describe('detectBOM', () => {
      it('should detect UTF-8 BOM', () => {
        const buf = Buffer.from([
          0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f,
        ]);
        const result = detectBOM(buf);
        expect(result).toEqual({ encoding: 'utf8', bomLength: 3 });
      });

      it('should detect UTF-16 LE BOM', () => {
        const buf = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]);
        const result = detectBOM(buf);
        expect(result).toEqual({ encoding: 'utf16le', bomLength: 2 });
      });

      it('should detect UTF-16 BE BOM', () => {
        const buf = Buffer.from([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65]);
        const result = detectBOM(buf);
        expect(result).toEqual({ encoding: 'utf16be', bomLength: 2 });
      });

      it('should detect UTF-32 LE BOM', () => {
        const buf = Buffer.from([
          0xff, 0xfe, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00,
        ]);
        const result = detectBOM(buf);
        expect(result).toEqual({ encoding: 'utf32le', bomLength: 4 });
      });

      it('should detect UTF-32 BE BOM', () => {
        const buf = Buffer.from([
          0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x48,
        ]);
        const result = detectBOM(buf);
        expect(result).toEqual({ encoding: 'utf32be', bomLength: 4 });
      });

      it('should return null for no BOM', () => {
        const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
        const result = detectBOM(buf);
        expect(result).toBeNull();
      });

      it('should return null for empty buffer', () => {
        const buf = Buffer.alloc(0);
        const result = detectBOM(buf);
        expect(result).toBeNull();
      });

      it('should return null for partial BOM', () => {
        const buf = Buffer.from([0xef, 0xbb]); // Incomplete UTF-8 BOM
        const result = detectBOM(buf);
        expect(result).toBeNull();
      });
    });

    describe('readFileWithEncoding', () => {
      it('should read UTF-8 BOM file correctly', async () => {
        const content = 'Hello, 世界! 🌍';
        const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const utf8Content = Buffer.from(content, 'utf8');
        const fullBuffer = Buffer.concat([utf8Bom, utf8Content]);

        const filePath = path.join(testDir, 'utf8-bom.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should read UTF-16 LE BOM file correctly', async () => {
        const content = 'Hello, 世界! 🌍';
        const utf16leBom = Buffer.from([0xff, 0xfe]);
        const utf16leContent = Buffer.from(content, 'utf16le');
        const fullBuffer = Buffer.concat([utf16leBom, utf16leContent]);

        const filePath = path.join(testDir, 'utf16le-bom.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should read UTF-16 BE BOM file correctly', async () => {
        const content = 'Hello, 世界! 🌍';
        // Manually encode UTF-16 BE: each char as big-endian 16-bit
        const utf16beBom = Buffer.from([0xfe, 0xff]);
        const chars = Array.from(content);
        const utf16beBytes: number[] = [];

        for (const char of chars) {
          const code = char.codePointAt(0)!;
          if (code > 0xffff) {
            // Surrogate pair for emoji
            const surrogate1 = 0xd800 + ((code - 0x10000) >> 10);
            const surrogate2 = 0xdc00 + ((code - 0x10000) & 0x3ff);
            utf16beBytes.push((surrogate1 >> 8) & 0xff, surrogate1 & 0xff);
            utf16beBytes.push((surrogate2 >> 8) & 0xff, surrogate2 & 0xff);
          } else {
            utf16beBytes.push((code >> 8) & 0xff, code & 0xff);
          }
        }

        const utf16beContent = Buffer.from(utf16beBytes);
        const fullBuffer = Buffer.concat([utf16beBom, utf16beContent]);

        const filePath = path.join(testDir, 'utf16be-bom.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should read UTF-32 LE BOM file correctly', async () => {
        const content = 'Hello, 世界! 🌍';
        const utf32leBom = Buffer.from([0xff, 0xfe, 0x00, 0x00]);

        const utf32leBytes: number[] = [];
        for (const char of Array.from(content)) {
          const code = char.codePointAt(0)!;
          utf32leBytes.push(
            code & 0xff,
            (code >> 8) & 0xff,
            (code >> 16) & 0xff,
            (code >> 24) & 0xff,
          );
        }

        const utf32leContent = Buffer.from(utf32leBytes);
        const fullBuffer = Buffer.concat([utf32leBom, utf32leContent]);

        const filePath = path.join(testDir, 'utf32le-bom.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should read UTF-32 BE BOM file correctly', async () => {
        const content = 'Hello, 世界! 🌍';
        const utf32beBom = Buffer.from([0x00, 0x00, 0xfe, 0xff]);

        const utf32beBytes: number[] = [];
        for (const char of Array.from(content)) {
          const code = char.codePointAt(0)!;
          utf32beBytes.push(
            (code >> 24) & 0xff,
            (code >> 16) & 0xff,
            (code >> 8) & 0xff,
            code & 0xff,
          );
        }

        const utf32beContent = Buffer.from(utf32beBytes);
        const fullBuffer = Buffer.concat([utf32beBom, utf32beContent]);

        const filePath = path.join(testDir, 'utf32be-bom.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should read file without BOM as UTF-8', async () => {
        const content = 'Hello, 世界!';
        const filePath = path.join(testDir, 'no-bom.txt');
        await fsPromises.writeFile(filePath, content, 'utf8');

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe(content);
      });

      it('should handle empty file', async () => {
        const filePath = path.join(testDir, 'empty.txt');
        await fsPromises.writeFile(filePath, '');

        const result = await readFileWithEncoding(filePath);
        expect(result).toBe('');
      });
    });

    describe('isBinaryFile with BOM awareness', () => {
      it('should not treat UTF-8 BOM file as binary', async () => {
        const content = 'Hello, world!';
        const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const utf8Content = Buffer.from(content, 'utf8');
        const fullBuffer = Buffer.concat([utf8Bom, utf8Content]);

        const filePath = path.join(testDir, 'utf8-bom-test.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(false);
      });

      it('should not treat UTF-16 LE BOM file as binary', async () => {
        const content = 'Hello, world!';
        const utf16leBom = Buffer.from([0xff, 0xfe]);
        const utf16leContent = Buffer.from(content, 'utf16le');
        const fullBuffer = Buffer.concat([utf16leBom, utf16leContent]);

        const filePath = path.join(testDir, 'utf16le-bom-test.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(false);
      });

      it('should not treat UTF-16 BE BOM file as binary', async () => {
        const utf16beBom = Buffer.from([0xfe, 0xff]);
        // Simple ASCII in UTF-16 BE
        const utf16beContent = Buffer.from([
          0x00,
          0x48, // H
          0x00,
          0x65, // e
          0x00,
          0x6c, // l
          0x00,
          0x6c, // l
          0x00,
          0x6f, // o
          0x00,
          0x2c, // ,
          0x00,
          0x20, // space
          0x00,
          0x77, // w
          0x00,
          0x6f, // o
          0x00,
          0x72, // r
          0x00,
          0x6c, // l
          0x00,
          0x64, // d
          0x00,
          0x21, // !
        ]);
        const fullBuffer = Buffer.concat([utf16beBom, utf16beContent]);

        const filePath = path.join(testDir, 'utf16be-bom-test.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(false);
      });

      it('should not treat UTF-32 LE BOM file as binary', async () => {
        const utf32leBom = Buffer.from([0xff, 0xfe, 0x00, 0x00]);
        const utf32leContent = Buffer.from([
          0x48,
          0x00,
          0x00,
          0x00, // H
          0x65,
          0x00,
          0x00,
          0x00, // e
          0x6c,
          0x00,
          0x00,
          0x00, // l
          0x6c,
          0x00,
          0x00,
          0x00, // l
          0x6f,
          0x00,
          0x00,
          0x00, // o
        ]);
        const fullBuffer = Buffer.concat([utf32leBom, utf32leContent]);

        const filePath = path.join(testDir, 'utf32le-bom-test.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(false);
      });

      it('should not treat UTF-32 BE BOM file as binary', async () => {
        const utf32beBom = Buffer.from([0x00, 0x00, 0xfe, 0xff]);
        const utf32beContent = Buffer.from([
          0x00,
          0x00,
          0x00,
          0x48, // H
          0x00,
          0x00,
          0x00,
          0x65, // e
          0x00,
          0x00,
          0x00,
          0x6c, // l
          0x00,
          0x00,
          0x00,
          0x6c, // l
          0x00,
          0x00,
          0x00,
          0x6f, // o
        ]);
        const fullBuffer = Buffer.concat([utf32beBom, utf32beContent]);

        const filePath = path.join(testDir, 'utf32be-bom-test.txt');
        await fsPromises.writeFile(filePath, fullBuffer);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(false);
      });

      it('should still treat actual binary file as binary', async () => {
        // PNG header + some binary data with null bytes
        const pngHeader = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        const binaryData = Buffer.from([
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        ]); // IHDR chunk with nulls
        const fullContent = Buffer.concat([pngHeader, binaryData]);
        const filePath = path.join(testDir, 'test.png');
        await fsPromises.writeFile(filePath, fullContent);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(true);
      });

      it('should treat file with null bytes (no BOM) as binary', async () => {
        const content = Buffer.from([
          0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64,
        ]);
        const filePath = path.join(testDir, 'null-bytes.bin');
        await fsPromises.writeFile(filePath, content);

        const result = await isBinaryFile(filePath);
        expect(result).toBe(true);
      });
    });
  });

  describe('detectFileType', () => {
    let filePathForDetectTest: string;

    beforeEach(() => {
      filePathForDetectTest = path.join(tempRootDir, 'detectType.tmp');
      // Default: create as a text file for isBinaryFile fallback
      actualNodeFs.writeFileSync(filePathForDetectTest, 'Plain text content');
    });

    afterEach(() => {
      if (actualNodeFs.existsSync(filePathForDetectTest)) {
        actualNodeFs.unlinkSync(filePathForDetectTest);
      }
      vi.restoreAllMocks(); // Restore spies on actualNodeFs
    });

    it('should detect typescript type by extension (ts, mts, cts, tsx)', async () => {
      expect(await detectFileType('file.ts')).toBe('text');
      expect(await detectFileType('file.test.ts')).toBe('text');
      expect(await detectFileType('file.mts')).toBe('text');
      expect(await detectFileType('vite.config.mts')).toBe('text');
      expect(await detectFileType('file.cts')).toBe('text');
      expect(await detectFileType('component.tsx')).toBe('text');
    });

    it('should detect image type by extension (png)', async () => {
      mockMimeLookup.mockReturnValueOnce('image/png');
      expect(await detectFileType('file.png')).toBe('image');
    });

    it('should detect image type by extension (jpeg)', async () => {
      mockMimeLookup.mockReturnValueOnce('image/jpeg');
      expect(await detectFileType('file.jpg')).toBe('image');
    });

    it('should detect svg type by extension', async () => {
      expect(await detectFileType('image.svg')).toBe('svg');
      expect(await detectFileType('image.icon.svg')).toBe('svg');
    });

    it('should detect pdf type by extension', async () => {
      mockMimeLookup.mockReturnValueOnce('application/pdf');
      expect(await detectFileType('file.pdf')).toBe('pdf');
    });

    it('should detect audio type by extension', async () => {
      mockMimeLookup.mockReturnValueOnce('audio/mpeg');
      expect(await detectFileType('song.mp3')).toBe('audio');
    });

    it('should detect video type by extension', async () => {
      mockMimeLookup.mockReturnValueOnce('video/mp4');
      expect(await detectFileType('movie.mp4')).toBe('video');
    });

    it('should detect known binary extensions as binary (e.g. .zip)', async () => {
      mockMimeLookup.mockReturnValueOnce('application/zip');
      expect(await detectFileType('archive.zip')).toBe('binary');
    });
    it('should detect known binary extensions as binary (e.g. .exe)', async () => {
      mockMimeLookup.mockReturnValueOnce('application/octet-stream'); // Common for .exe
      expect(await detectFileType('app.exe')).toBe('binary');
    });

    it('should use isBinaryFile for unknown extensions and detect as binary', async () => {
      mockMimeLookup.mockReturnValueOnce(false); // Unknown mime type
      // Create a file that isBinaryFile will identify as binary
      const binaryContent = Buffer.from([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
      ]);
      actualNodeFs.writeFileSync(filePathForDetectTest, binaryContent);
      expect(await detectFileType(filePathForDetectTest)).toBe('binary');
    });

    it('should default to text if mime type is unknown and content is not binary', async () => {
      mockMimeLookup.mockReturnValueOnce(false); // Unknown mime type
      // filePathForDetectTest is already a text file by default from beforeEach
      expect(await detectFileType(filePathForDetectTest)).toBe('text');
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
      if (actualNodeFs.existsSync(testBinaryFilePath))
        actualNodeFs.unlinkSync(testBinaryFilePath);
    });

    it('should read a text file successfully', async () => {
      const content = 'Line 1\\nLine 2\\nLine 3';
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

    it('should handle file not found', async () => {
      const result = await processSingleFileContent(
        nonexistentFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.error).toContain('File not found');
      expect(result.returnDisplay).toContain('File not found');
    });

    it('should handle read errors for text files', async () => {
      actualNodeFs.writeFileSync(testTextFilePath, 'content'); // File must exist for initial statSync
      const readError = new Error('Simulated read error');
      vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(readError);

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.error).toContain('Simulated read error');
      expect(result.returnDisplay).toContain('Simulated read error');
    });

    it('should handle read errors for image/pdf files', async () => {
      actualNodeFs.writeFileSync(testImageFilePath, 'content'); // File must exist
      mockMimeLookup.mockReturnValue('image/png');
      const readError = new Error('Simulated image read error');
      vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(readError);

      const result = await processSingleFileContent(
        testImageFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.error).toContain('Simulated image read error');
      expect(result.returnDisplay).toContain('Simulated image read error');
    });

    it('should process an image file', async () => {
      const fakePngData = Buffer.from('fake png data');
      actualNodeFs.writeFileSync(testImageFilePath, fakePngData);
      mockMimeLookup.mockReturnValue('image/png');
      const result = await processSingleFileContent(
        testImageFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(
        (result.llmContent as { inlineData: unknown }).inlineData,
      ).toBeDefined();
      expect(
        (result.llmContent as { inlineData: { mimeType: string } }).inlineData
          .mimeType,
      ).toBe('image/png');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(fakePngData.toString('base64'));
      expect(result.returnDisplay).toContain('Read image file: image.png');
    });

    it('should process a PDF file', async () => {
      const fakePdfData = Buffer.from('fake pdf data');
      actualNodeFs.writeFileSync(testPdfFilePath, fakePdfData);
      mockMimeLookup.mockReturnValue('application/pdf');
      const result = await processSingleFileContent(
        testPdfFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(
        (result.llmContent as { inlineData: unknown }).inlineData,
      ).toBeDefined();
      expect(
        (result.llmContent as { inlineData: { mimeType: string } }).inlineData
          .mimeType,
      ).toBe('application/pdf');
      expect(
        (result.llmContent as { inlineData: { data: string } }).inlineData.data,
      ).toBe(fakePdfData.toString('base64'));
      expect(result.returnDisplay).toContain('Read pdf file: document.pdf');
    });

    it('should read an SVG file as text when under 1MB', async () => {
      const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="blue" />
    </svg>
  `;
      const testSvgFilePath = path.join(tempRootDir, 'test.svg');
      actualNodeFs.writeFileSync(testSvgFilePath, svgContent, 'utf-8');

      mockMimeLookup.mockReturnValue('image/svg+xml');

      const result = await processSingleFileContent(
        testSvgFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );

      expect(result.llmContent).toBe(svgContent);
      expect(result.returnDisplay).toContain('Read SVG as text');
    });

    it('should skip binary files', async () => {
      actualNodeFs.writeFileSync(
        testBinaryFilePath,
        Buffer.from([0x00, 0x01, 0x02]),
      );
      mockMimeLookup.mockReturnValueOnce('application/octet-stream');
      // isBinaryFile will operate on the real file.

      const result = await processSingleFileContent(
        testBinaryFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.llmContent).toContain(
        'Cannot display content of binary file',
      );
      expect(result.returnDisplay).toContain('Skipped binary file: app.exe');
    });

    it('should handle path being a directory', async () => {
      const result = await processSingleFileContent(
        directoryPath,
        tempRootDir,
        new StandardFileSystemService(),
      );
      expect(result.error).toContain('Path is a directory');
      expect(result.returnDisplay).toContain('Path is a directory');
    });

    it('should paginate text files correctly (offset and limit)', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        5,
        5,
      ); // Read lines 6-10
      const expectedContent = lines.slice(5, 10).join('\n');

      expect(result.llmContent).toBe(expectedContent);
      expect(result.returnDisplay).toBe('Read lines 6-10 of 20 from test.txt');
      expect(result.isTruncated).toBe(true);
      expect(result.originalLineCount).toBe(20);
      expect(result.linesShown).toEqual([6, 10]);
    });

    it('should identify truncation when reading the end of a file', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      // Read from line 11 to 20. The start is not 0, so it's truncated.
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        10,
        10,
      );
      const expectedContent = lines.slice(10, 20).join('\n');

      expect(result.llmContent).toContain(expectedContent);
      expect(result.returnDisplay).toBe('Read lines 11-20 of 20 from test.txt');
      expect(result.isTruncated).toBe(true); // This is the key check for the bug
      expect(result.originalLineCount).toBe(20);
      expect(result.linesShown).toEqual([11, 20]);
    });

    it('should handle limit exceeding file length', async () => {
      const lines = ['Line 1', 'Line 2'];
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        0,
        10,
      );
      const expectedContent = lines.join('\n');

      expect(result.llmContent).toBe(expectedContent);
      expect(result.returnDisplay).toBe('');
      expect(result.isTruncated).toBe(false);
      expect(result.originalLineCount).toBe(2);
      expect(result.linesShown).toEqual([1, 2]);
    });

    it('should truncate long lines in text files', async () => {
      const longLine = 'a'.repeat(2500);
      actualNodeFs.writeFileSync(
        testTextFilePath,
        `Short line\n${longLine}\nAnother short line`,
      );

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );

      expect(result.llmContent).toContain('Short line');
      expect(result.llmContent).toContain(
        longLine.substring(0, 2000) + '... [truncated]',
      );
      expect(result.llmContent).toContain('Another short line');
      expect(result.returnDisplay).toBe(
        'Read all 3 lines from test.txt (some lines were shortened)',
      );
      expect(result.isTruncated).toBe(true);
    });

    it('should truncate when line count exceeds the limit', async () => {
      const lines = Array.from({ length: 11 }, (_, i) => `Line ${i + 1}`);
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      // Read 5 lines, but there are 11 total
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        0,
        5,
      );

      expect(result.isTruncated).toBe(true);
      expect(result.returnDisplay).toBe('Read lines 1-5 of 11 from test.txt');
    });

    it('should truncate when a line length exceeds the character limit', async () => {
      const longLine = 'b'.repeat(2500);
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
      lines.push(longLine); // Total 11 lines
      actualNodeFs.writeFileSync(testTextFilePath, lines.join('\n'));

      // Read all 11 lines, including the long one
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        0,
        11,
      );

      expect(result.isTruncated).toBe(true);
      expect(result.returnDisplay).toBe(
        'Read all 11 lines from test.txt (some lines were shortened)',
      );
    });

    it('should truncate both line count and line length when both exceed limits', async () => {
      const linesWithLongInMiddle = Array.from(
        { length: 20 },
        (_, i) => `Line ${i + 1}`,
      );
      linesWithLongInMiddle[4] = 'c'.repeat(2500);
      actualNodeFs.writeFileSync(
        testTextFilePath,
        linesWithLongInMiddle.join('\n'),
      );

      // Read 10 lines out of 20, including the long line
      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
        0,
        10,
      );
      expect(result.isTruncated).toBe(true);
      expect(result.returnDisplay).toBe(
        'Read lines 1-10 of 20 from test.txt (some lines were shortened)',
      );
    });

    it('should return an error if the file size exceeds 20MB', async () => {
      // Create a file just over 20MB
      const twentyOneMB = 21 * 1024 * 1024;
      const buffer = Buffer.alloc(twentyOneMB, 0x61); // Fill with 'a'
      actualNodeFs.writeFileSync(testTextFilePath, buffer);

      const result = await processSingleFileContent(
        testTextFilePath,
        tempRootDir,
        new StandardFileSystemService(),
      );

      expect(result.error).toContain('File size exceeds the 20MB limit');
      expect(result.returnDisplay).toContain(
        'File size exceeds the 20MB limit',
      );
      expect(result.llmContent).toContain('File size exceeds the 20MB limit');
    });
  });
});
