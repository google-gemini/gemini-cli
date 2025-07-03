/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { PartUnion } from '@google/genai';
import mime from 'mime-types';
import { Resvg } from '@resvg/resvg-js';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

// Constants for text file processing
const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

// Default values for encoding and separator format
export const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

/**
 * Looks up the specific MIME type for a file path.
 * @param filePath Path to the file.
 * @returns The specific MIME type string (e.g., 'text/python', 'application/javascript') or undefined if not found or ambiguous.
 */
export function getSpecificMimeType(filePath: string): string | undefined {
  const lookedUpMime = mime.lookup(filePath);
  return typeof lookedUpMime === 'string' ? lookedUpMime : undefined;
}

/**
 * Checks if a path is within a given root directory.
 * @param pathToCheck The absolute path to check.
 * @param rootDirectory The absolute root directory.
 * @returns True if the path is within the root directory, false otherwise.
 */
export function isWithinRoot(pathToCheck: string, rootDirectory: string): boolean {
  const normalizedPathToCheck = path.normalize(pathToCheck);
  const normalizedRootDirectory = path.normalize(rootDirectory);

  // Ensure the rootDirectory path ends with a separator for correct startsWith comparison,
  // unless it's the root path itself (e.g., '/' or 'C:\').
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

/**
 * Determines if a file is likely binary based on content sampling.
 * @param filePath Path to the file.
 * @returns True if the file appears to be binary.
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();

  // Always text extensions that should never be considered binary
  const alwaysTextExtensions = ['.svg', '.xml', '.html', '.js', '.ts', '.css', '.json'];
  if (alwaysTextExtensions.includes(ext)) {
    return false;
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    // Read up to 4KB or file size, whichever is smaller
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize === 0) {
      // Empty file is not considered binary for content checking
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
      // Null byte is a strong indicator
      if (buffer[i] === 0) return true;
      if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
        nonPrintableCount++;
      }
    }

    // If >30% non-printable characters, consider it binary
    return nonPrintableCount / bytesRead > 0.3;
  } catch {
    // If any error occurs (e.g. file not found, permissions),
    // treat as not binary here; let higher-level functions handle existence/access errors.
    return false;
  }
}

/**
 * Detects the type of file based on extension and content.
 * @param filePath Path to the file.
 * @returns 'text', 'image', 'pdf', 'audio', 'video', or 'binary'.
 */
export function detectFileType(filePath: string): 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' {
  const ext = path.extname(filePath).toLowerCase();

  // The mimetype for "ts" is MPEG transport stream (a video format) but we want
  // to assume these are typescript files instead.
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

  // Stricter binary check for common non-text extensions before content check
  // These are often not well-covered by mime-types or might be misidentified.
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

  // Fallback to content-based check if mime type wasn't conclusive for image/pdf
  // and it's not a known binary extension.
  if (isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

/**
 * Sanitizes SVG content to remove potentially harmful elements.
 * @param svgString The SVG content as a string.
 * @returns Sanitized SVG string.
 */
function sanitizeSvg(svgString: string): string {
  const window = new JSDOM('').window;
  const purify = DOMPurify(window as any);

  const sanitizedSvg = purify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  return sanitizedSvg;
}

/**
 * Converts SVG buffer to PNG buffer using Resvg.
 * @param svgBuffer Buffer containing SVG data.
 * @returns Promise that resolves to PNG buffer.
 * @throws Error if conversion fails.
 */
async function convertSvgToPng(svgBuffer: Buffer): Promise<Buffer> {
  try {
    const svgString = svgBuffer.toString('utf8');
    const sanitizedSvg = sanitizeSvg(svgString);
    
    const resvg = new Resvg(sanitizedSvg);
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    return Buffer.from(pngBuffer);
  } catch (error) {
    throw new Error(`Failed to convert SVG to PNG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Interface for the result of processing a single file's content.
 */
export interface ProcessedFileReadResult {
  /** Content formatted for LLM consumption */
  llmContent: PartUnion;
  /** Human-readable display message */
  returnDisplay: string;
  /** Error message if processing failed */
  error?: string;
  /** Whether the content was truncated */
  isTruncated?: boolean;
  /** Original number of lines in the file (for text files) */
  originalLineCount?: number;
  /** Range of lines shown [start, end] (for text files) */
  linesShown?: [number, number];
}

/**
 * Processes a single file's content and returns it in a format suitable for LLM consumption.
 * @param filePath Absolute path to the file to process.
 * @param rootDirectory Root directory for relative path calculation.
 * @param offset Starting line number for text files (0-based).
 * @param limit Maximum number of lines to read for text files.
 * @returns Promise that resolves to ProcessedFileReadResult.
 */
export async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  offset?: number,
  limit?: number,
): Promise<ProcessedFileReadResult> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        llmContent: '',
        returnDisplay: 'File not found.',
        error: `File not found: ${filePath}`,
      };
    }
    
    // Get file stats and validate it's a file
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return {
        llmContent: '',
        returnDisplay: 'Path is a directory.',
        error: `Path is a directory, not a file: ${filePath}`,
      };
    }

    // Check file size limits (20MB max)
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

    // Determine file type and calculate relative path for display
    const fileType = detectFileType(filePath);
    const relativePathForDisplay = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');

    // Process file based on its type
    switch (fileType) {
      case 'binary': {
        return {
          llmContent: `Cannot display content of binary file: ${relativePathForDisplay}`,
          returnDisplay: `Skipped binary file: ${relativePathForDisplay}`,
        };
      }
      case 'text': {
        // Read and process text file with line limits
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const originalLineCount = lines.length;

        // Calculate line range to display
        const startLine = offset || 0;
        const effectiveLimit =
          limit === undefined ? DEFAULT_MAX_LINES_TEXT_FILE : limit;
        const endLine = Math.min(startLine + effectiveLimit, originalLineCount);
        const actualStartLine = Math.min(startLine, originalLineCount);
        const selectedLines = lines.slice(actualStartLine, endLine);

        // Truncate individual lines if too long
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

        // Determine if content was truncated
        const contentRangeTruncated = endLine < originalLineCount;
        const isTruncated = contentRangeTruncated || linesWereTruncatedInLength;

        // Build LLM content with truncation notices
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
        // Read binary content for media files
        const contentBuffer = await fs.promises.readFile(filePath);
        
        const fileExtension = path.extname(filePath).toLowerCase();
        const originalMimeType = mime.lookup(filePath) || 'application/octet-stream';
        
        // Special handling for SVG files - convert to PNG
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
            // Fallback to text content if PNG conversion fails
            const svgText = contentBuffer.toString('utf8');
            const sanitizedSvg = sanitizeSvg(svgText);
            return {
              llmContent: `SVG file content (conversion to PNG failed):\n${sanitizedSvg}`,
              returnDisplay: `Read SVG file as text (PNG conversion failed): ${relativePathForDisplay}`,
              error: `SVG to PNG conversion failed: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`,
            };
          }
        }
        
        // Handle other media files as base64 encoded data
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
        // This should never happen due to TypeScript exhaustiveness checking
        const exhaustiveCheck: never = fileType;
        return {
          llmContent: `Unhandled file type: ${exhaustiveCheck}`,
          returnDisplay: `Skipped unhandled file type: ${relativePathForDisplay}`,
          error: `Unhandled file type for ${filePath}`,
        };
      }
    }
  } catch (error) {
    // Handle any errors that occur during file processing
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
