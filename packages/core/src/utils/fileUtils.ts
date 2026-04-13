/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { PartUnion } from '@google/genai';
import { isBinaryFile as isBinaryFileCheck } from 'isbinaryfile';
import mime from 'mime/lite';
import type { FileSystemService } from '../services/fileSystemService.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { BINARY_EXTENSIONS } from './ignorePatterns.js';
import { createRequire as createModuleRequire } from 'node:module';
import { debugLogger } from './debugLogger.js';
import {
  DEFAULT_MAX_LINES_TEXT_FILE,
  MAX_LINE_LENGTH_TEXT_FILE,
  MAX_FILE_SIZE_MB,
} from './constants.js';

const requireModule = createModuleRequire(import.meta.url);

export async function readWasmBinaryFromDisk(
  specifier: string,
): Promise<Uint8Array> {
  const resolvedPath = requireModule.resolve(specifier);
  const buffer = await fsPromises.readFile(resolvedPath);
  return new Uint8Array(buffer);
}

export async function loadWasmBinary(
  dynamicImport: () => Promise<{ default: Uint8Array }>,
  fallbackSpecifier: string,
): Promise<Uint8Array> {
  try {
    const module = await dynamicImport();
    if (module?.default instanceof Uint8Array) {
      return module.default;
    }
  } catch (error) {
    try {
      return await readWasmBinaryFromDisk(fallbackSpecifier);
    } catch {
      throw error;
    }
  }

  try {
    return await readWasmBinaryFromDisk(fallbackSpecifier);
  } catch (error) {
    throw new Error('WASM binary module did not provide a Uint8Array export', {
      cause: error,
    });
  }
}

// Default values for encoding and separator format
export const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

// --- Unicode BOM detection & decoding helpers --------------------------------

type UnicodeEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be';

interface BOMInfo {
  encoding: UnicodeEncoding;
  bomLength: number;
}

/**
 * Detect a Unicode BOM (Byte Order Mark) if present.
 * Reads up to the first 4 bytes and returns encoding + BOM length, else null.
 */
export function detectBOM(buf: Buffer): BOMInfo | null {
  if (buf.length >= 4) {
    // UTF-32 LE: FF FE 00 00
    if (
      buf[0] === 0xff &&
      buf[1] === 0xfe &&
      buf[2] === 0x00 &&
      buf[3] === 0x00
    ) {
      return { encoding: 'utf32le', bomLength: 4 };
    }
    // UTF-32 BE: 00 00 FE FF
    if (
      buf[0] === 0x00 &&
      buf[1] === 0x00 &&
      buf[2] === 0xfe &&
      buf[3] === 0xff
    ) {
      return { encoding: 'utf32be', bomLength: 4 };
    }
  }
  if (buf.length >= 3) {
    // UTF-8: EF BB BF
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return { encoding: 'utf8', bomLength: 3 };
    }
  }
  if (buf.length >= 2) {
    // UTF-16 LE: FF FE  (but not UTF-32 LE already matched above)
    if (
      buf[0] === 0xff &&
      buf[1] === 0xfe &&
      (buf.length < 4 || buf[2] !== 0x00 || buf[3] !== 0x00)
    ) {
      return { encoding: 'utf16le', bomLength: 2 };
    }
    // UTF-16 BE: FE FF
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      return { encoding: 'utf16be', bomLength: 2 };
    }
  }
  return null;
}

/**
 * Convert a UTF-16 BE buffer to a JS string by swapping to LE then using Node's decoder.
 * (Node has 'utf16le' but not 'utf16be'.)
 */
function decodeUTF16BE(buf: Buffer): string {
  if (buf.length === 0) return '';
  const swapped = Buffer.from(buf); // swap16 mutates in place, so copy
  swapped.swap16();
  return swapped.toString('utf16le');
}

/**
 * Decode a UTF-32 buffer (LE or BE) into a JS string.
 * Invalid code points are replaced with U+FFFD, partial trailing bytes are ignored.
 */
function decodeUTF32(buf: Buffer, littleEndian: boolean): string {
  if (buf.length < 4) return '';
  const usable = buf.length - (buf.length % 4);
  let out = '';
  for (let i = 0; i < usable; i += 4) {
    const cp = littleEndian
      ? (buf[i] |
          (buf[i + 1] << 8) |
          (buf[i + 2] << 16) |
          (buf[i + 3] << 24)) >>>
        0
      : (buf[i + 3] |
          (buf[i + 2] << 8) |
          (buf[i + 1] << 16) |
          (buf[i] << 24)) >>>
        0;
    // Valid planes: 0x0000..0x10FFFF excluding surrogates
    if (cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
      out += String.fromCodePoint(cp);
    } else {
      out += '\uFFFD';
    }
  }
  return out;
}

/**
 * Read a file as text, honoring BOM encodings (UTF‑8/16/32) and stripping the BOM.
 * Falls back to utf8 when no BOM is present.
 */
export async function readFileWithEncoding(filePath: string): Promise<string> {
  // Read the file once; detect BOM and decode from the single buffer.
  const full = await fs.promises.readFile(filePath);
  if (full.length === 0) return '';

  const bom = detectBOM(full);
  if (!bom) {
    // No BOM → treat as UTF‑8
    return full.toString('utf8');
  }

  // Strip BOM and decode per encoding
  const content = full.subarray(bom.bomLength);
  switch (bom.encoding) {
    case 'utf8':
      return content.toString('utf8');
    case 'utf16le':
      return content.toString('utf16le');
    case 'utf16be':
      return decodeUTF16BE(content);
    case 'utf32le':
      return decodeUTF32(content, true);
    case 'utf32be':
      return decodeUTF32(content, false);
    default:
      // Defensive fallback; should be unreachable
      return content.toString('utf8');
  }
}

/**
 * Looks up the specific MIME type for a file path.
 * @param filePath Path to the file.
 * @returns The specific MIME type string (e.g., 'text/python', 'application/javascript') or undefined if not found or ambiguous.
 */
export function getSpecificMimeType(filePath: string): string | undefined {
  const lookedUpMime = mime.getType(filePath);
  return typeof lookedUpMime === 'string' ? lookedUpMime : undefined;
}

const SUPPORTED_AUDIO_MIME_TYPES_BY_EXTENSION = new Map<string, string>([
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.aiff', 'audio/aiff'],
  ['.aif', 'audio/aiff'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
]);

const AUDIO_MIME_TYPE_NORMALIZATION: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'audio/x-aiff': 'audio/aiff',
  'audio/aif': 'audio/aiff',
  'audio/x-aac': 'audio/aac',
};

function formatSupportedAudioFormats(): string {
  const displayNames = Array.from(
    new Set(
      Array.from(SUPPORTED_AUDIO_MIME_TYPES_BY_EXTENSION.keys()).map((ext) => {
        if (ext === '.aif' || ext === '.aiff') {
          return 'AIFF';
        }
        return ext.slice(1).toUpperCase();
      }),
    ),
  );

  if (displayNames.length <= 1) {
    return displayNames[0] ?? '';
  }

  return `${displayNames.slice(0, -1).join(', ')}, and ${displayNames.at(-1)}`;
}

const SUPPORTED_AUDIO_FORMATS_DISPLAY = formatSupportedAudioFormats();

function getSupportedAudioMimeTypeForFile(
  filePath: string,
): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  const extensionMimeType =
    SUPPORTED_AUDIO_MIME_TYPES_BY_EXTENSION.get(extension);
  const lookedUpMimeType = getSpecificMimeType(filePath)?.toLowerCase();
  const normalizedMimeType = lookedUpMimeType
    ? (AUDIO_MIME_TYPE_NORMALIZATION[lookedUpMimeType] ?? lookedUpMimeType)
    : undefined;

  if (
    normalizedMimeType &&
    [...SUPPORTED_AUDIO_MIME_TYPES_BY_EXTENSION.values()].includes(
      normalizedMimeType,
    )
  ) {
    return normalizedMimeType;
  }

  return extensionMimeType;
}

/**
 * Checks if a path is within a given root directory.
 * @param pathToCheck The absolute path to check.
 * @param rootDirectory The absolute root directory.
 * @returns True if the path is within the root directory, false otherwise.
 */
export function isWithinRoot(
  pathToCheck: string,
  rootDirectory: string,
): boolean {
  const normalizedPathToCheck = path.resolve(pathToCheck);
  const normalizedRootDirectory = path.resolve(rootDirectory);

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
 * Safely resolves a path to its real path if it exists, otherwise returns the absolute resolved path.
 */
export function getRealPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/**
 * Checks if a file's content is empty or contains only whitespace.
 * Efficiently checks file size first, and only samples the beginning of the file.
 * Honors Unicode BOM encodings.
 */
export async function isEmpty(filePath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(filePath);
    if (stats.size === 0) return true;

    // Sample up to 1KB to check for non-whitespace content.
    // If a file is larger than 1KB and contains only whitespace,
    // it's an extreme edge case we can afford to read slightly more of if needed,
    // but for most valid plans/files, this is sufficient.
    const fd = await fsPromises.open(filePath, 'r');
    try {
      const { buffer } = await fd.read({
        buffer: Buffer.alloc(Math.min(1024, stats.size)),
        offset: 0,
        length: Math.min(1024, stats.size),
        position: 0,
      });

      const bom = detectBOM(buffer);
      const content = bom
        ? buffer.subarray(bom.bomLength).toString('utf8')
        : buffer.toString('utf8');

      return content.trim().length === 0;
    } finally {
      await fd.close();
    }
  } catch {
    // If file is unreadable, we treat it as empty/invalid for validation purposes
    return true;
  }
}

/**
 * Heuristic: determine if a file is likely binary.
 * Delegates to the `isbinaryfile` package for UTF-8-aware detection.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    return await isBinaryFileCheck(filePath);
  } catch (error) {
    debugLogger.warn(
      `Failed to check if file is binary: ${filePath}`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/**
 * Detects the type of file based on extension and content.
 * @param filePath Path to the file.
 * @returns Promise that resolves to 'text', 'image', 'pdf', 'audio', 'video', 'binary' or 'svg'.
 */
export async function detectFileType(
  filePath: string,
): Promise<'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'svg'> {
  const ext = path.extname(filePath).toLowerCase();

  // The mimetype for various TypeScript extensions (ts, mts, cts, tsx) can be
  // MPEG transport stream (a video format), but we want to assume these are
  // TypeScript files instead.
  if (['.ts', '.mts', '.cts'].includes(ext)) {
    return 'text';
  }

  if (ext === '.svg') {
    return 'svg';
  }

  const lookedUpMimeType = mime.getType(filePath); // Returns null if not found, or the mime type string
  if (lookedUpMimeType) {
    if (lookedUpMimeType.startsWith('image/')) {
      return 'image';
    }
    // Verify audio/video with content check to avoid MIME misidentification (#16888)
    if (
      lookedUpMimeType.startsWith('audio/') ||
      lookedUpMimeType.startsWith('video/')
    ) {
      if (!(await isBinaryFile(filePath))) {
        return 'text';
      }
      return lookedUpMimeType.startsWith('audio/') ? 'audio' : 'video';
    }
    if (lookedUpMimeType === 'application/pdf') {
      return 'pdf';
    }
  }

  const supportedAudioMimeType = getSupportedAudioMimeTypeForFile(filePath);
  if (supportedAudioMimeType) {
    if (!(await isBinaryFile(filePath))) {
      return 'text';
    }
    return 'audio';
  }

  // Stricter binary check for common non-text extensions before content check
  // These are often not well-covered by mime-types or might be misidentified.
  if (BINARY_EXTENSIONS.includes(ext)) {
    return 'binary';
  }

  // Fall back to content-based check if mime type wasn't conclusive for image/pdf
  // and it's not a known binary extension.
  if (await isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

export interface ProcessedFileReadResult {
  llmContent: PartUnion; // string for text, Part for image/pdf/unreadable binary
  returnDisplay: string;
  error?: string; // Optional error message for the LLM if file processing failed
  errorType?: ToolErrorType; // Structured error type
  isTruncated?: boolean; // For text files, indicates if content was truncated
  originalLineCount?: number; // For text files
  linesShown?: [number, number]; // For text files [startLine, endLine] (1-based for display)
}

/**
 * Reads and processes a single file, handling text, images, and PDFs.
 * @param filePath Absolute path to the file.
 * @param rootDirectory Absolute path to the project root for relative path display.
 * @param _fileSystemService Currently unused in this function; kept for signature stability.
 * @param startLine Optional 1-based line number to start reading from.
 * @param endLine Optional 1-based line number to end reading at (inclusive).
 * @returns ProcessedFileReadResult object.
 */
export async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  _fileSystemService: FileSystemService,
  startLine?: number,
  endLine?: number,
): Promise<ProcessedFileReadResult> {
  try {
    if (!fs.existsSync(filePath)) {
      // Sync check is acceptable before async read
      return {
        llmContent:
          'Could not read file because no file was found at the specified path.',
        returnDisplay: 'File not found.',
        error: `File not found: ${filePath}`,
        errorType: ToolErrorType.FILE_NOT_FOUND,
      };
    }
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return {
        llmContent:
          'Could not read file because the provided path is a directory, not a file.',
        returnDisplay: 'Path is a directory.',
        error: `Path is a directory, not a file: ${filePath}`,
        errorType: ToolErrorType.TARGET_IS_DIRECTORY,
      };
    }

    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > MAX_FILE_SIZE_MB) {
      return {
        llmContent: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.`,
        returnDisplay: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.`,
        error: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit: ${filePath} (${fileSizeInMB.toFixed(2)}MB)`,
        errorType: ToolErrorType.FILE_TOO_LARGE,
      };
    }

    const fileType = await detectFileType(filePath);
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
      case 'svg': {
        const SVG_MAX_SIZE_BYTES = 1 * 1024 * 1024;
        if (stats.size > SVG_MAX_SIZE_BYTES) {
          return {
            llmContent: `Cannot display content of SVG file larger than 1MB: ${relativePathForDisplay}`,
            returnDisplay: `Skipped large SVG file (>1MB): ${relativePathForDisplay}`,
          };
        }
        const content = await readFileWithEncoding(filePath);
        return {
          llmContent: content,
          returnDisplay: `Read SVG as text: ${relativePathForDisplay}`,
        };
      }
      case 'text': {
        // Use BOM-aware reader to avoid leaving a BOM character in content and to support UTF-16/32 transparently
        const content = await readFileWithEncoding(filePath);
        const lines = content.split(/\r?\n/);
        const originalLineCount = lines.length;

        let sliceStart = 0;
        let sliceEnd = originalLineCount;

        if (startLine !== undefined || endLine !== undefined) {
          sliceStart = startLine ? startLine - 1 : 0;
          sliceEnd = endLine
            ? Math.min(endLine, originalLineCount)
            : Math.min(
                sliceStart + DEFAULT_MAX_LINES_TEXT_FILE,
                originalLineCount,
              );
        } else {
          sliceEnd = Math.min(DEFAULT_MAX_LINES_TEXT_FILE, originalLineCount);
        }

        // Ensure selectedLines doesn't try to slice beyond array bounds
        const actualStart = Math.min(sliceStart, originalLineCount);
        const selectedLines = lines.slice(actualStart, sliceEnd);

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

        const isTruncated =
          actualStart > 0 ||
          sliceEnd < originalLineCount ||
          linesWereTruncatedInLength;
        const llmContent = formattedLines.join('\n');

        // By default, return nothing to streamline the common case of a successful read_file.
        let returnDisplay = '';
        if (actualStart > 0 || sliceEnd < originalLineCount) {
          returnDisplay = `Read lines ${
            actualStart + 1
          }-${sliceEnd} of ${originalLineCount} from ${relativePathForDisplay}`;
          if (linesWereTruncatedInLength) {
            returnDisplay += ' (some lines were shortened)';
          }
        } else if (linesWereTruncatedInLength) {
          returnDisplay = `Read all ${originalLineCount} lines from ${relativePathForDisplay} (some lines were shortened)`;
        }

        return {
          llmContent,
          returnDisplay,
          isTruncated,
          originalLineCount,
          linesShown: [actualStart + 1, sliceEnd],
        };
      }
      case 'audio': {
        const mimeType = getSupportedAudioMimeTypeForFile(filePath);
        if (!mimeType) {
          return {
            llmContent: `Could not read audio file because its format is not supported. Supported audio formats are ${SUPPORTED_AUDIO_FORMATS_DISPLAY}.`,
            returnDisplay: `Unsupported audio file format: ${relativePathForDisplay}`,
            error: `Unsupported audio file format for ${filePath}. Supported audio formats are ${SUPPORTED_AUDIO_FORMATS_DISPLAY}.`,
            errorType: ToolErrorType.READ_CONTENT_FAILURE,
          };
        }
        const contentBuffer = await fs.promises.readFile(filePath);
        const base64Data = contentBuffer.toString('base64');
        return {
          llmContent: {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          returnDisplay: `Read audio file: ${relativePathForDisplay}`,
        };
      }
      case 'image':
      case 'pdf':
      case 'video': {
        const mimeType =
          getSpecificMimeType(filePath) ?? 'application/octet-stream';
        const contentBuffer = await fs.promises.readFile(filePath);
        const base64Data = contentBuffer.toString('base64');
        return {
          llmContent: {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          returnDisplay: `Read ${fileType} file: ${relativePathForDisplay}`,
        };
      }
      default: {
        // Should not happen with current detectFileType logic
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
      errorType: ToolErrorType.READ_CONTENT_FAILURE,
    };
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a string for use as a filename part by removing path traversal
 * characters and other non-alphanumeric characters.
 */
export function sanitizeFilenamePart(part: string): string {
  return part.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Formats a truncated message for tool output.
 * Shows the first 20% and last 80% of the allowed characters with a marker in between.
 */
export function formatTruncatedToolOutput(
  contentStr: string,
  outputFile: string,
  maxChars: number,
): string {
  if (contentStr.length <= maxChars) return contentStr;

  const headChars = Math.floor(maxChars * 0.2);
  const tailChars = maxChars - headChars;

  const head = contentStr.slice(0, headChars);
  const tail = contentStr.slice(-tailChars);
  const omittedChars = contentStr.length - headChars - tailChars;

  return `Output too large. Showing first ${headChars.toLocaleString()} and last ${tailChars.toLocaleString()} characters. For full output see: ${outputFile}
${head}

... [${omittedChars.toLocaleString()} characters omitted] ...

${tail}`;
}

/**
 * Saves tool output to a temporary file for later retrieval.
 */
export const TOOL_OUTPUTS_DIR = 'tool-outputs';

export async function saveTruncatedToolOutput(
  content: string,
  toolName: string,
  id: string | number, // Accept string (callId) or number (truncationId)
  projectTempDir: string,
  sessionId?: string,
): Promise<{ outputFile: string }> {
  const safeToolName = sanitizeFilenamePart(toolName).toLowerCase();
  const safeId = sanitizeFilenamePart(id.toString()).toLowerCase();
  const fileName = safeId.startsWith(safeToolName)
    ? `${safeId}.txt`
    : `${safeToolName}_${safeId}.txt`;

  let toolOutputDir = path.join(projectTempDir, TOOL_OUTPUTS_DIR);
  if (sessionId) {
    const safeSessionId = sanitizeFilenamePart(sessionId);
    toolOutputDir = path.join(toolOutputDir, `session-${safeSessionId}`);
  }
  const outputFile = path.join(toolOutputDir, fileName);

  await fsPromises.mkdir(toolOutputDir, { recursive: true });
  await fsPromises.writeFile(outputFile, content);

  return { outputFile };
}
