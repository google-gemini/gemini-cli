/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as zlib from 'zlib';

/**
 * Represents the extracted content of a VSIX file
 */
export interface VsixContent {
  files: Map<string, string>;
}

interface ZipEntry {
  fileName: string;
  localHeaderOffset: number;
  compressedSize: number;
  compressionMethod: number;
  nextOffset: number;
}

/**
 * Extracts content from a VSIX buffer (which is a ZIP file)
 * VSIX files are actually ZIP archives, so we need to extract them
 */
export async function extractVsixContent(
  vsixBuffer: Buffer,
): Promise<VsixContent> {
  // For now, implement a basic ZIP extraction using Node.js built-ins
  // This is a simplified implementation - in production, you might want to use
  // a dedicated ZIP library like 'yauzl' or 'node-stream-zip'

  try {
    const files = new Map<string, string>();

    // Simple ZIP parsing implementation
    // This is a basic implementation that handles the most common VSIX structure
    const content = await parseZipBuffer(vsixBuffer);

    // Add parsed files to the map
    for (const [path, data] of content) {
      files.set(path, data);
    }

    return { files };
  } catch (error) {
    throw new Error(
      `Failed to extract VSIX content: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Basic ZIP buffer parsing
 * This is an improved implementation that attempts real ZIP parsing
 * while maintaining a fallback for the current demo
 */
async function parseZipBuffer(buffer: Buffer): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  try {
    // Attempt to parse as a real ZIP file
    const zipContent = await parseRealZipStructure(buffer);
    if (zipContent.size > 0) {
      return zipContent;
    }
  } catch (error) {
    console.warn('❌ Real ZIP parsing failed:', error);
    console.warn(
      '⚠️ This will result in the AI generation being used instead of VSIX extraction',
    );
    // Don't fall back to mock data - return empty so AI generation can be used
    return new Map<string, string>();
  }

  // This should not be reached if ZIP parsing works
  console.warn(
    '⚠️ ZIP parsing returned no files, falling back to mock data - this will result in default theme colors',
  );
  // Fallback to mock structure for demo purposes
  const mockPackageJson = {
    name: 'extracted-theme',
    contributes: {
      themes: [
        {
          label: 'Extracted Theme',
          uiTheme: 'vs-dark',
          path: './themes/theme.json',
        },
      ],
    },
  };

  // Create mock theme content
  const mockTheme = {
    name: 'Extracted Theme',
    type: 'dark',
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'button.background': '#007acc',
      'editor.findMatchBackground': '#264f78',
      'editor.lineHighlightBackground': '#2d2d30',
      'editor.wordHighlightBackground': '#2d2d30',
      'editorGutter.addedBackground': '#6a9955',
      'editorGutter.modifiedBackground': '#ce9178',
      'editorGutter.deletedBackground': '#f44747',
      'editorLineNumber.foreground': '#858585',
    },
    tokenColors: [
      {
        scope: 'keyword',
        settings: { foreground: '#569cd6' },
      },
      {
        scope: 'string',
        settings: { foreground: '#ce9178' },
      },
      {
        scope: 'comment',
        settings: { foreground: '#6a9955' },
      },
    ],
  };

  files.set('extension/package.json', JSON.stringify(mockPackageJson, null, 2));
  files.set('extension/themes/theme.json', JSON.stringify(mockTheme, null, 2));

  return files;
}

/**
 * Attempts to parse real ZIP file structure
 */
async function parseRealZipStructure(
  buffer: Buffer,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  console.log(
    `🔍 Attempting to parse ZIP structure, buffer size: ${buffer.length} bytes`,
  );

  // Look for ZIP file signature
  if (buffer.length < 4) {
    throw new Error('Buffer too small to be a ZIP file');
  }

  // Check for ZIP signature at the beginning
  const signature = buffer.readUInt32LE(0);
  console.log(
    `🔍 Buffer signature: 0x${signature.toString(16)} (expected ZIP signatures: 0x04034b50 or 0x06054b50)`,
  );

  // Common ZIP signatures:
  // 0x04034b50 - Local file header
  // 0x02014b50 - Central directory file header
  // 0x06054b50 - End of central directory record

  // Find end of central directory record
  const endOfCentralDir = findEndOfCentralDirectory(buffer);
  if (!endOfCentralDir) {
    throw new Error('Invalid ZIP file: End of central directory not found');
  }

  console.log(
    `🔍 Found central directory: ${endOfCentralDir.totalEntries} entries, offset: ${endOfCentralDir.centralDirOffset}`,
  );

  // Read central directory entries
  let offset = endOfCentralDir.centralDirOffset;

  for (let i = 0; i < endOfCentralDir.totalEntries; i++) {
    const entry = readCentralDirectoryEntry(buffer, offset);
    if (!entry) break;

    offset = entry.nextOffset;

    // Read the actual file data
    const fileData = readFileData(buffer, entry);
    if (fileData) {
      files.set(entry.fileName, fileData);
      console.log(
        `✅ Successfully extracted file: ${entry.fileName} (${fileData.length} chars)`,
      );
    } else {
      console.warn(`⚠️ Failed to extract file: ${entry.fileName}`);
    }
  }

  console.log(`🔍 Successfully extracted ${files.size} files from ZIP`);
  return files;
}

/**
 * Find the end of central directory record
 */
function findEndOfCentralDirectory(buffer: Buffer) {
  // Look for end of central directory signature (0x06054b50) from the end
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.subarray(i, i + 4).equals(signature)) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + i, 22);
      return {
        totalEntries: view.getUint16(10, true),
        centralDirSize: view.getUint32(12, true),
        centralDirOffset: view.getUint32(16, true),
      };
    }
  }
  return null;
}

/**
 * Read a central directory entry
 */
function readCentralDirectoryEntry(
  buffer: Buffer,
  offset: number,
): ZipEntry | null {
  if (offset + 46 > buffer.length) return null;

  const signature = buffer.readUInt32LE(offset);
  if (signature !== 0x02014b50) return null; // Central directory file header signature

  const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
  const fileNameLength = view.getUint16(28, true);
  const extraFieldLength = view.getUint16(30, true);
  const commentLength = view.getUint16(32, true);
  const localHeaderOffset = view.getUint32(42, true);
  const compressedSize = view.getUint32(20, true);
  const compressionMethod = view.getUint16(10, true);

  if (offset + 46 + fileNameLength > buffer.length) return null;

  const fileName = buffer
    .subarray(offset + 46, offset + 46 + fileNameLength)
    .toString('utf8');

  return {
    fileName,
    localHeaderOffset,
    compressedSize,
    compressionMethod,
    nextOffset: offset + 46 + fileNameLength + extraFieldLength + commentLength,
  };
}

/**
 * Read file data from local file header
 */
function readFileData(buffer: Buffer, entry: ZipEntry): string | null {
  try {
    const localOffset = entry.localHeaderOffset;
    if (localOffset + 30 > buffer.length) return null;

    const signature = buffer.readUInt32LE(localOffset);
    if (signature !== 0x04034b50) return null; // Local file header signature

    const view = new DataView(buffer.buffer, buffer.byteOffset + localOffset);
    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);

    const dataOffset = localOffset + 30 + fileNameLength + extraFieldLength;
    if (dataOffset + entry.compressedSize > buffer.length) return null;

    const compressedData = buffer.subarray(
      dataOffset,
      dataOffset + entry.compressedSize,
    );

    // Handle compression
    if (entry.compressionMethod === 0) {
      // No compression - stored
      return compressedData.toString('utf8');
    } else if (entry.compressionMethod === 8) {
      // Deflate compression
      try {
        const decompressed = zlib.inflateRawSync(compressedData);
        return decompressed.toString('utf8');
      } catch (error) {
        console.warn(`Failed to decompress file ${entry.fileName}:`, error);
        return null;
      }
    }

    // Unsupported compression method
    return null;
  } catch (error) {
    console.warn(`Failed to read file data for ${entry.fileName}:`, error);
    return null;
  }
}
