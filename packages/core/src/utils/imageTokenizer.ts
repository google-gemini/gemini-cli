// This file is created to address security vulnerabilities in image tokenization
// Based on security analysis of PR #15672

import { readFileSync } from 'fs';
import { extname } from 'path';

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Validates that reading at a specific offset with a specific length
 * is safe within the bounds of the buffer
 */
function validateBufferBounds(buffer: Buffer, offset: number, length: number): boolean {
  return offset >= 0 && offset + length <= buffer.length;
}

/**
 * Safely reads a 32-bit unsigned integer from buffer with bounds checking
 */
function safeReadUInt32(buffer: Buffer, offset: number, littleEndian: boolean): number | null {
  if (!validateBufferBounds(buffer, offset, 4)) {
    return null;
  }
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

/**
 * Safely reads a 16-bit unsigned integer from buffer with bounds checking
 */
function safeReadUInt16(buffer: Buffer, offset: number, littleEndian: boolean): number | null {
  if (!validateBufferBounds(buffer, offset, 2)) {
    return null;
  }
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

/**
 * Parses TIFF image dimensions with proper bounds checking to prevent buffer overflows
 */
function parseTiffDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) {
    throw new Error('Invalid TIFF: Buffer too small to contain header');
  }

  // Check for valid TIFF header
  const isLittleEndian = buffer[0] === 0x49 && buffer[1] === 0x49; // "II"
  const isBigEndian = buffer[0] === 0x4D && buffer[1] === 0x4D;   // "MM"
  
  if (!isLittleEndian && !isBigEndian) {
    throw new Error('Invalid TIFF: Invalid byte order marker');
  }

  // Validate TIFF header (2nd and 3rd bytes are byte order, 4th and 5th are magic number 42)
  if ((isLittleEndian && buffer[2] !== 0x2A && buffer[3] !== 0x00) ||
      (isBigEndian && buffer[3] !== 0x2A && buffer[2] !== 0x00)) {
    throw new Error('Invalid TIFF: Invalid magic number');
  }

  // Read offset to first IFD (Image File Directory) - 4 bytes after header
  const ifdOffset = isLittleEndian ? 
    buffer.readUInt32LE(4) : 
    buffer.readUInt32BE(4);
    
  if (ifdOffset >= buffer.length) {
    throw new Error('Invalid TIFF: IFD offset beyond buffer length');
  }

  // Read number of directory entries at the IFD offset
  if (!validateBufferBounds(buffer, ifdOffset, 2)) {
    throw new Error('Invalid TIFF: Cannot read directory entry count');
  }
  
  const numEntries = isLittleEndian ? 
    buffer.readUInt16LE(ifdOffset) : 
    buffer.readUInt16BE(ifdOffset);
  
  if (numEntries <= 0) {
    return null; // No entries to process
  }

  // Validate that buffer has enough space for all entries (12 bytes per entry)
  const expectedSize = ifdOffset + 2 + (numEntries * 12);
  if (expectedSize > buffer.length) {
    throw new Error('Invalid TIFF: Buffer too small for directory entries');
  }

  // Parse directory entries to find image width and height tags
  let width = 0;
  let height = 0;
  const entryOffset = ifdOffset + 2; // Skip the count field

  for (let i = 0; i < numEntries; i++) {
    const currentEntryOffset = entryOffset + (i * 12);
    
    // Read tag (2 bytes)
    const tag = isLittleEndian ?
      buffer.readUInt16LE(currentEntryOffset) :
      buffer.readUInt16BE(currentEntryOffset);
    
    // Read type (2 bytes) - 3 for SHORT, 4 for LONG
    const type = isLittleEndian ?
      buffer.readUInt16LE(currentEntryOffset + 2) :
      buffer.readUInt16BE(currentEntryOffset + 2);
    
    // Read count (4 bytes)
    const countResult = safeReadUInt32(buffer, currentEntryOffset + 4, isLittleEndian);
    if (countResult === null) {
      throw new Error('Invalid TIFF: Cannot read count for tag');
    }
    const count = countResult;
    
    // Read value (4 bytes) - for values <= 4 bytes, the value is stored here
    // For longer values, this contains an offset to the actual value
    const valueOffset = currentEntryOffset + 8;
    
    if (tag === 256) { // ImageWidth tag
      if (type === 3 && count === 1) { // SHORT type
        const valueResult = safeReadUInt16(buffer, valueOffset, isLittleEndian);
        if (valueResult !== null) width = valueResult;
      } else if (type === 4 && count === 1) { // LONG type
        const valueResult = safeReadUInt32(buffer, valueOffset, isLittleEndian);
        if (valueResult !== null) width = valueResult;
      } else if (count === 1) { // Need to read from offset
        const offsetResult = safeReadUInt32(buffer, valueOffset, isLittleEndian);
        if (offsetResult !== null && validateBufferBounds(buffer, offsetResult, type === 3 ? 2 : 4)) {
          if (type === 3) { // SHORT
            const valueResult = safeReadUInt16(buffer, offsetResult, isLittleEndian);
            if (valueResult !== null) width = valueResult;
          } else { // LONG
            const valueResult = safeReadUInt32(buffer, offsetResult, isLittleEndian);
            if (valueResult !== null) width = valueResult;
          }
        }
      }
    } else if (tag === 257) { // ImageLength tag (height)
      if (type === 3 && count === 1) { // SHORT type
        const valueResult = safeReadUInt16(buffer, valueOffset, isLittleEndian);
        if (valueResult !== null) height = valueResult;
      } else if (type === 4 && count === 1) { // LONG type
        const valueResult = safeReadUInt32(buffer, valueOffset, isLittleEndian);
        if (valueResult !== null) height = valueResult;
      } else if (count === 1) { // Need to read from offset
        const offsetResult = safeReadUInt32(buffer, valueOffset, isLittleEndian);
        if (offsetResult !== null && validateBufferBounds(buffer, offsetResult, type === 3 ? 2 : 4)) {
          if (type === 3) { // SHORT
            const valueResult = safeReadUInt16(buffer, offsetResult, isLittleEndian);
            if (valueResult !== null) height = valueResult;
          } else { // LONG
            const valueResult = safeReadUInt32(buffer, offsetResult, isLittleEndian);
            if (valueResult !== null) height = valueResult;
          }
        }
      }
    }
  }

  if (width > 0 && height > 0) {
    return { width, height };
  }
  return null;
}

/**
 * Parses PNG image dimensions with proper bounds checking
 */
function parsePngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) {
    throw new Error('Invalid PNG: Buffer too small to contain header');
  }

  // Check PNG signature
  const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== pngSignature[i]) {
      throw new Error('Invalid PNG: Invalid signature');
    }
  }

  // Read width (4 bytes after signature + chunk header)
  if (!validateBufferBounds(buffer, 16, 8)) {
    throw new Error('Invalid PNG: Cannot read dimensions from header');
  }
  
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

/**
 * Parses JPEG image dimensions with proper bounds checking
 */
function parseJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4) {
    throw new Error('Invalid JPEG: Buffer too small');
  }

  // Check for JPEG SOI (Start of Image)
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    throw new Error('Invalid JPEG: Missing SOI marker');
  }

  let offset = 2;

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xFF) {
      throw new Error('Invalid JPEG: Malformed marker');
    }

    const marker = buffer[offset + 1];
    offset += 2;

    // Skip non-size markers
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      continue;
    }

    // Check if we have enough bytes for the segment length
    if (!validateBufferBounds(buffer, offset, 2)) {
      throw new Error('Invalid JPEG: Incomplete segment');
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || !validateBufferBounds(buffer, offset, segmentLength)) {
      throw new Error('Invalid JPEG: Invalid segment length');
    }

    // SOF markers (0xC0-0xCF) contain image dimensions
    if ((marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)) {
      
      if (segmentLength < 7) {
        throw new Error('Invalid JPEG: SOF segment too short');
      }
      
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      
      return { width, height };
    }

    // Move to next segment
    offset += segmentLength;
  }

  throw new Error('Invalid JPEG: Could not find SOF marker');
}

/**
 * Validates image dimensions are within reasonable bounds
 */
export function validateImageDimensions(dimensions: ImageDimensions): boolean {
  const MAX_DIMENSION = 65536; // Reasonable limit for image dimensions
  return dimensions.width > 0 && 
         dimensions.height > 0 && 
         dimensions.width <= MAX_DIMENSION && 
         dimensions.height <= MAX_DIMENSION;
}

/**
 * Safely gets image dimensions from a file with comprehensive validation
 */
export function getImageDimensions(filePath: string): ImageDimensions | null {
  // Validate file extension first
  const extension = extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.gif', '.bmp'].includes(extension)) {
    throw new Error(`Unsupported image format: ${extension}`);
  }

  // Read file with size limit to prevent resource exhaustion
  const maxFileSize = 50 * 1024 * 1024; // 50MB limit
  const stats = require('fs').statSync(filePath);
  if (stats.size > maxFileSize) {
    throw new Error(`File too large: ${stats.size} bytes (max: ${maxFileSize})`);
  }

  const buffer = readFileSync(filePath);

  let dimensions: ImageDimensions | null = null;

  switch (extension) {
    case '.tiff':
    case '.tif':
      dimensions = parseTiffDimensions(buffer);
      break;
    case '.png':
      dimensions = parsePngDimensions(buffer);
      break;
    case '.jpg':
    case '.jpeg':
      dimensions = parseJpegDimensions(buffer);
      break;
    default:
      throw new Error(`Unsupported image format: ${extension}`);
  }

  if (dimensions === null) {
    throw new Error(`Could not extract dimensions from ${filePath}`);
  }

  if (!validateImageDimensions(dimensions)) {
    throw new Error(`Invalid image dimensions: ${dimensions.width}x${dimensions.height}`);
  }

  return dimensions;
}

/**
 * Calculates tokens for image based on dimensions
 */
export function calculateImageTokens(dimensions: ImageDimensions): number {
  // Using the standard calculation from the PR: 170 + (H/50) * (W/50) * 85,
  // with a maximum of 16,384 tokens
  const height = dimensions.height;
  const width = dimensions.width;
  
  // Apply standard calculation
  const tileCount = Math.ceil(height / 50) * Math.ceil(width / 50);
  let tokenCount = 170 + tileCount * 85;
  
  // Apply maximum limit
  tokenCount = Math.min(tokenCount, 16384);
  
  return tokenCount;
}

/**
 * Calculates tokens directly from an image file with all security validations
 */
export function calculateImageTokensFromFile(filePath: string): number {
  const dimensions = getImageDimensions(filePath);
  return calculateImageTokens(dimensions);
}