import fs from 'fs';
import path from 'path';
import { PartUnion } from '@google/genai';
import mime from 'mime-types';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

export const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

export function getSpecificMimeType(filePath: string): string | undefined {
  const lookedUpMime = mime.lookup(filePath);
  return typeof lookedUpMime === 'string' ? lookedUpMime : undefined;
}

export function isWithinRoot(pathToCheck: string, rootDirectory: string): boolean {
  const normalizedPathToCheck = path.normalize(pathToCheck);
  const normalizedRootDirectory = path.normalize(rootDirectory);

  const rootWithSeparator =
    normalizedRootDirectory === path.sep ||
    normalizedRootDirectory.endsWith(path.sep)
      ? normalizedRootDirectory
      : normalizedRootDirectory + path.sep;

  return (
    normalizedPathToCheck === normalizedRootDirectory ||
    normalizedPathToCheck.startsWith(rootWithSeparator)
  );
}

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();

  const alwaysTextExtensions = ['.svg', '.xml', '.html', '.js', '.ts', '.css', '.json'];
  if (alwaysTextExtensions.includes(ext)) {
    return false;
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize === 0) {
      fs.closeSync(fd);
      return false;
    }

    const bufferSize = Math.min(4096, fileSize);
    const buffer = Buffer.alloc(bufferSize);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    if (bytesRead === 0) return false;

    let nonPrintableCount = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
      if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
        nonPrintableCount++;
      }
    }

    return nonPrintableCount / bytesRead > 0.3;
  } catch {
    return false;
  }
}

export function detectFileType(filePath: string): 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.ts') {
    return 'text';
  }

  const lookedUpMimeType = mime.lookup(filePath);
  if (lookedUpMimeType) {
    if (lookedUpMimeType.startsWith('image/')) {
      return 'image';
    }
    if (lookedUpMimeType.startsWith('audio/')) {
      return 'audio';
    }
    if (lookedUpMimeType.startsWith('video/')) {
      return 'video';
    }
    if (lookedUpMimeType === 'application/pdf') {
      return 'pdf';
    }
  }

  if (
    [
      '.zip',
      '.tar',
      '.gz',
      '.exe',
      '.dll',
      '.so',
      '.class',
      '.jar',
      '.war',
      '.7z',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.odt',
      '.ods',
      '.odp',
      '.bin',
      '.dat',
      '.obj',
      '.o',
      '.a',
      '.lib',
      '.wasm',
      '.pyc',
      '.pyo',
    ].includes(ext)
  ) {
    return 'binary';
  }

  if (isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

function sanitizeSvg(svgString: string): string {
  const window = new JSDOM('').window;
  const purify = DOMPurify(window as any);

  const sanitizedSvg = purify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  return sanitizedSvg;
}

async function convertSvgToPng(svgBuffer: Buffer): Promise<Buffer> {
  try {
    const svgString = svgBuffer.toString('utf8');
    const sanitizedSvg = sanitizeSvg(svgString);
    const sanitizedBuffer = Buffer.from(sanitizedSvg, 'utf8');
    
    return await sharp(sanitizedBuffer)
      .png()
      .toBuffer();
  } catch (error) {
    throw new Error(`Failed to convert SVG to PNG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface ProcessedFileReadResult {
  llmContent: PartUnion;
  returnDisplay: string;
  error?: string;
  isTruncated?: boolean;
  originalLineCount?: number;
  linesShown?: [number, number];
}

export async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  offset?: number,
  limit?: number,
): Promise<ProcessedFileReadResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        llmContent: '',
        returnDisplay: 'File not found.',
        error: `File not found: ${filePath}`,
      };
    }
    
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return {
        llmContent: '',
        returnDisplay: 'Path is a directory.',
        error: `Path is a directory, not a file: ${filePath}`,
      };
    }

    const fileSizeInBytes = stats.size;
    const maxFileSize = 20 * 1024 * 1024;

    if (fileSizeInBytes > maxFileSize) {
      throw new Error(
        `File size exceeds the 20MB limit: ${filePath} (${(
          fileSizeInBytes /
          (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }

    const fileType = detectFileType(filePath);
    const relativePathForDisplay = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');

    switch (fileType) {
      case 'binary': {
        return {
          llmContent: `Cannot display content of binary file: ${relativePathForDisplay}`,
          returnDisplay: `Skipped binary file: ${relativePathForDisplay}`,
        };
      }
      case 'text': {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const originalLineCount = lines.length;

        const startLine = offset || 0;
        const effectiveLimit =
          limit === undefined ? DEFAULT_MAX_LINES_TEXT_FILE : limit;
        const endLine = Math.min(startLine + effectiveLimit, originalLineCount);
        const actualStartLine = Math.min(startLine, originalLineCount);
        const selectedLines = lines.slice(actualStartLine, endLine);

        let linesWereTruncatedInLength = false;
        const formattedLines = selectedLines.map((line) => {
          if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
            linesWereTruncatedInLength = true;
            return (
              line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + '... [truncated]'
            );
          }
          return line;
        });

        const contentRangeTruncated = endLine < originalLineCount;
        const isTruncated = contentRangeTruncated || linesWereTruncatedInLength;

        let llmTextContent = '';
        if (contentRangeTruncated) {
          llmTextContent += `[File content truncated: showing lines ${actualStartLine + 1}-${endLine} of ${originalLineCount} total lines. Use offset/limit parameters to view more.]\n`;
        } else if (linesWereTruncatedInLength) {
          llmTextContent += `[File content partially truncated: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n`;
        }
        llmTextContent += formattedLines.join('\n');

        return {
          llmContent: llmTextContent,
          returnDisplay: isTruncated ? '(truncated)' : '',
          isTruncated,
          originalLineCount,
          linesShown: [actualStartLine + 1, endLine],
        };
      }
      case 'image':
      case 'pdf':
      case 'audio':
      case 'video': {
        const contentBuffer = await fs.promises.readFile(filePath);
        
        const fileExtension = path.extname(filePath).toLowerCase();
        const originalMimeType = mime.lookup(filePath) || 'application/octet-stream';
        
        if (fileExtension === '.svg' || originalMimeType === 'image/svg+xml') {
          try {
            const pngBuffer = await convertSvgToPng(contentBuffer);
            const base64Data = pngBuffer.toString('base64');
            return {
              llmContent: {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/png',
                },
              },
              returnDisplay: `Read SVG file (converted to PNG): ${relativePathForDisplay}`,
            };
          } catch (conversionError) {
            const svgText = contentBuffer.toString('utf8');
            const sanitizedSvg = sanitizeSvg(svgText);
            return {
              llmContent: `SVG file content (conversion to PNG failed):\n${sanitizedSvg}`,
              returnDisplay: `Read SVG file as text (PNG conversion failed): ${relativePathForDisplay}`,
              error: `SVG to PNG conversion failed: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`,
            };
          }
        }
        
        const base64Data = contentBuffer.toString('base64');
        return {
          llmContent: {
            inlineData: {
              data: base64Data,
              mimeType: originalMimeType,
            },
          },
          returnDisplay: `Read ${fileType} file: ${relativePathForDisplay}`,
        };
      }
      default: {
        const exhaustiveCheck: never = fileType;
        return {
          llmContent: `Unhandled file type: ${exhaustiveCheck}`,
          returnDisplay: `Skipped unhandled file type: ${relativePathForDisplay}`,
          error: `Unhandled file type for ${filePath}`,
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const displayPath = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');
    return {
      llmContent: `Error reading file ${displayPath}: ${errorMessage}`,
      returnDisplay: `Error reading file ${displayPath}: ${errorMessage}`,
      error: `Error reading file ${filePath}: ${errorMessage}`,
    };
  }
}