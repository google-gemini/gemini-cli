/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageMetadata } from './types.js';
import { isSupportedImageMimeType } from './supportedImageFormats.js';

/**
 * Image tokenizer for calculating image tokens based on Gemini API specifications
 *
 * Key rules:
 * - Gemini 1.0/1.5: Fixed 258 tokens per image
 * - Gemini 2.0: 258 tokens per 768x768 tile (images <= 384x384 are 258 tokens)
 * - Source: https://ai.google.dev/gemini-api/docs/tokens
 *
 * Currently implements the standard 258 token count which is the baseline
 * for both Gemini 1.5 and 2.0 (for standard/small images).
 */
export class ImageTokenizer {
  /**
   * Fixed token count for images in Gemini models.
   * Source: https://ai.google.dev/gemini-api/docs/tokens
   */
  private static readonly TOKENS_PER_IMAGE = 258;

  /**
   * Extract image metadata from base64 data
   *
   * @param base64Data Base64-encoded image data (with or without data URL prefix)
   * @param mimeType MIME type of the image
   * @returns Promise resolving to ImageMetadata with dimensions and format info
   */
  async extractImageMetadata(
    base64Data: string,
    mimeType: string,
  ): Promise<ImageMetadata> {
    try {
      // Check if the MIME type is supported
      if (!isSupportedImageMimeType(mimeType)) {
        console.warn(`Unsupported image format: ${mimeType}`);
        // Return default metadata for unsupported formats
        return {
          width: 512,
          height: 512,
          mimeType,
          dataSize: Math.floor(base64Data.length * 0.75),
        };
      }

      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const dimensions = await this.extractDimensions(buffer, mimeType);

      return {
        width: dimensions.width,
        height: dimensions.height,
        mimeType,
        dataSize: buffer.length,
      };
    } catch (error) {
      console.warn('Failed to extract image metadata:', error);
      // Return default metadata for fallback
      return {
        width: 512,
        height: 512,
        mimeType,
        dataSize: Math.floor(base64Data.length * 0.75),
      };
    }
  }

  /**
   * Extract image dimensions from buffer based on format
   *
   * @param buffer Binary image data buffer
   * @param mimeType MIME type to determine parsing strategy
   * @returns Promise resolving to width and height dimensions
   */
  private async extractDimensions(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ width: number; height: number }> {
    if (mimeType.includes('png')) {
      return this.extractPngDimensions(buffer);
    }

    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return this.extractJpegDimensions(buffer);
    }

    if (mimeType.includes('webp')) {
      return this.extractWebpDimensions(buffer);
    }

    if (mimeType.includes('gif')) {
      return this.extractGifDimensions(buffer);
    }

    if (mimeType.includes('bmp')) {
      return this.extractBmpDimensions(buffer);
    }

    if (mimeType.includes('tiff')) {
      return this.extractTiffDimensions(buffer);
    }

    if (mimeType.includes('heic')) {
      return this.extractHeicDimensions(buffer);
    }

    return { width: 512, height: 512 };
  }

  /**
   * Extract PNG dimensions from IHDR chunk
   * PNG signature: 89 50 4E 47 0D 0A 1A 0A
   * Width/height at bytes 16-19 and 20-23 (big-endian)
   */
  private extractPngDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 24) {
      throw new Error('Invalid PNG: buffer too short');
    }

    // Verify PNG signature
    const signature = buffer.subarray(0, 8);
    const expectedSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (!signature.equals(expectedSignature)) {
      throw new Error('Invalid PNG signature');
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
  }

  /**
   * Extract JPEG dimensions from SOF (Start of Frame) markers
   * JPEG starts with FF D8, SOF markers: 0xC0-0xC3, 0xC5-0xC7, 0xC9-0xCB, 0xCD-0xCF
   * Dimensions at offset +5 (height) and +7 (width) from SOF marker
   */
  private extractJpegDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error('Invalid JPEG signature');
    }

    let offset = 2;

    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];

      // SOF markers
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }

      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }

    throw new Error('Could not find JPEG dimensions');
  }

  /**
   * Extract WebP dimensions from RIFF container
   * Supports VP8, VP8L, and VP8X formats
   */
  private extractWebpDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 30) {
      throw new Error('Invalid WebP: too short');
    }

    const riffSignature = buffer.subarray(0, 4).toString('ascii');
    const webpSignature = buffer.subarray(8, 12).toString('ascii');

    if (riffSignature !== 'RIFF' || webpSignature !== 'WEBP') {
      throw new Error('Invalid WebP signature');
    }

    const format = buffer.subarray(12, 16).toString('ascii');

    if (format === 'VP8 ') {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height };
    } else if (format === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    } else if (format === 'VP8X') {
      const width = (buffer.readUInt32LE(24) & 0xffffff) + 1;
      const height = (buffer.readUInt32LE(26) & 0xffffff) + 1;
      return { width, height };
    }

    throw new Error('Unsupported WebP format');
  }

  /**
   * Extract GIF dimensions from header
   * Supports GIF87a and GIF89a formats
   */
  private extractGifDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 10) {
      throw new Error('Invalid GIF: too short');
    }

    const signature = buffer.subarray(0, 6).toString('ascii');
    if (signature !== 'GIF87a' && signature !== 'GIF89a') {
      throw new Error('Invalid GIF signature');
    }

    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);

    return { width, height };
  }

  /**
   * Calculate tokens for an image based on its metadata
   *
   * @param metadata Image metadata containing width, height, and format info
   * @returns Total token count
   */
  calculateTokens(_metadata: ImageMetadata): number {
    // Return standard Gemini image token count
    return ImageTokenizer.TOKENS_PER_IMAGE;
  }

  /**
   * Calculate tokens for multiple images serially
   *
   * @param base64DataArray Array of image data with MIME type information
   * @returns Promise resolving to array of token counts in same order as input
   */
  async calculateTokensBatch(
    base64DataArray: Array<{ data: string; mimeType: string }>,
  ): Promise<number[]> {
    const results: number[] = [];

    for (const { data, mimeType } of base64DataArray) {
      try {
        const metadata = await this.extractImageMetadata(data, mimeType);
        results.push(this.calculateTokens(metadata));
      } catch (error) {
        console.warn('Error calculating tokens for image:', error);
        // Return standard tokens as fallback
        results.push(ImageTokenizer.TOKENS_PER_IMAGE);
      }
    }

    return results;
  }

  /**
   * Extract BMP dimensions from header
   * BMP signature: 42 4D (BM)
   * Width/height at bytes 18-21 and 22-25 (little-endian)
   */
  private extractBmpDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 26) {
      throw new Error('Invalid BMP: buffer too short');
    }

    // Verify BMP signature
    if (buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
      throw new Error('Invalid BMP signature');
    }

    const width = buffer.readUInt32LE(18);
    const height = buffer.readUInt32LE(22);

    return { width, height: Math.abs(height) }; // Height can be negative for top-down BMPs
  }

  /**
   * Extract TIFF dimensions from IFD (Image File Directory)
   * TIFF can be little-endian (II) or big-endian (MM)
   * Width/height are stored in IFD entries with tags 0x0100 and 0x0101
   */
  private extractTiffDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 8) {
      throw new Error('Invalid TIFF: buffer too short');
    }

    // Check byte order
    const byteOrder = buffer.subarray(0, 2).toString('ascii');
    const isLittleEndian = byteOrder === 'II';
    const isBigEndian = byteOrder === 'MM';

    if (!isLittleEndian && !isBigEndian) {
      throw new Error('Invalid TIFF byte order');
    }

    // Read magic number (should be 42)
    const magic = isLittleEndian
      ? buffer.readUInt16LE(2)
      : buffer.readUInt16BE(2);
    if (magic !== 42) {
      throw new Error('Invalid TIFF magic number');
    }

    // Read IFD offset
    const ifdOffset = isLittleEndian
      ? buffer.readUInt32LE(4)
      : buffer.readUInt32BE(4);

    if (ifdOffset >= buffer.length) {
      throw new Error('Invalid TIFF IFD offset');
    }

    // Read number of directory entries
    const numEntries = isLittleEndian
      ? buffer.readUInt16LE(ifdOffset)
      : buffer.readUInt16BE(ifdOffset);

    let width = 0;
    let height = 0;

    // Parse IFD entries
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;

      if (entryOffset + 12 > buffer.length) break;

      const tag = isLittleEndian
        ? buffer.readUInt16LE(entryOffset)
        : buffer.readUInt16BE(entryOffset);

      const type = isLittleEndian
        ? buffer.readUInt16LE(entryOffset + 2)
        : buffer.readUInt16BE(entryOffset + 2);

      const value = isLittleEndian
        ? buffer.readUInt32LE(entryOffset + 8)
        : buffer.readUInt32BE(entryOffset + 8);

      if (tag === 0x0100) {
        // ImageWidth
        width = type === 3 ? value : value; // SHORT or LONG
      } else if (tag === 0x0101) {
        // ImageLength (height)
        height = type === 3 ? value : value; // SHORT or LONG
      }

      if (width > 0 && height > 0) break;
    }

    if (width === 0 || height === 0) {
      throw new Error('Could not find TIFF dimensions');
    }

    return { width, height };
  }

  /**
   * Extract HEIC dimensions from meta box
   * HEIC is based on ISO Base Media File Format
   * This is a simplified implementation that looks for 'ispe' (Image Spatial Extents) box
   */
  private extractHeicDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    if (buffer.length < 12) {
      throw new Error('Invalid HEIC: buffer too short');
    }

    // Check for ftyp box with HEIC brand
    const ftypBox = buffer.subarray(4, 8).toString('ascii');
    if (ftypBox !== 'ftyp') {
      throw new Error('Invalid HEIC: missing ftyp box');
    }

    const brand = buffer.subarray(8, 12).toString('ascii');
    if (!['heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
      throw new Error('Invalid HEIC brand');
    }

    // Look for meta box and then ispe box
    let offset = 0;
    while (offset < buffer.length - 8) {
      const boxSize = buffer.readUInt32BE(offset);
      const boxType = buffer.subarray(offset + 4, offset + 8).toString('ascii');

      if (boxType === 'meta') {
        // Look for ispe box inside meta box
        const metaOffset = offset + 8;
        let innerOffset = metaOffset + 4; // Skip version and flags

        while (innerOffset < offset + boxSize - 8) {
          const innerBoxSize = buffer.readUInt32BE(innerOffset);
          const innerBoxType = buffer
            .subarray(innerOffset + 4, innerOffset + 8)
            .toString('ascii');

          if (innerBoxType === 'ispe') {
            // Found Image Spatial Extents box
            if (innerOffset + 20 <= buffer.length) {
              const width = buffer.readUInt32BE(innerOffset + 12);
              const height = buffer.readUInt32BE(innerOffset + 16);
              return { width, height };
            }
          }

          if (innerBoxSize === 0) break;
          innerOffset += innerBoxSize;
        }
      }

      if (boxSize === 0) break;
      offset += boxSize;
    }

    // Fallback: return default dimensions if we can't parse the structure
    console.warn('Could not extract HEIC dimensions, using default');
    return { width: 512, height: 512 };
  }
}
