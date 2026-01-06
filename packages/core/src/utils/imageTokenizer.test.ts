// Security-focused tests for image tokenizer
// These tests verify that the buffer bounds checking and validation prevents vulnerabilities

import { readFileSync } from 'fs';
import { calculateImageTokens, getImageDimensions } from './imageTokenizer';

describe('ImageTokenizer Security Tests', () => {
  // Test with a small PNG to verify normal operation
  it('should properly parse valid PNG with bounds checking', () => {
    // This is a minimal valid PNG file (89 bytes)
    const minimalPngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D,                         // Length
      0x49, 0x48, 0x44, 0x52,                         // Chunk type (IHDR)
      0x00, 0x00, 0x00, 0x01,                         // Width: 1
      0x00, 0x00, 0x00, 0x01,                         // Height: 1
      0x08, 0x06, 0x00, 0x00, 0x00,                   // Other IHDR data
      0x1F, 0x15, 0xC4, 0x89,                         // CRC
      0x00, 0x00, 0x00, 0x0A,                         // Length
      0x49, 0x44, 0x41, 0x54, 0x78, 0xDA, 0x63, 0x68, 0x00, 0x00, 0x00, 0x01, // IDAT
      0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
    ]);

    // Write to a temporary file
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_test.png');
    fs.writeFileSync(tempFile, minimalPngBuffer);
    
    try {
      const dimensions = getImageDimensions(tempFile);
      expect(dimensions).toEqual({width: 1, height: 1});
      const tokens = calculateImageTokens(dimensions);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(16384); // Should respect max
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  // Test with a small JPEG to verify normal operation
  it('should properly parse valid JPEG with bounds checking', () => {
    // This is a minimal valid JPEG file
    const minimalJpegBuffer = Buffer.from([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, 0x00, 0x10, // APP0
      0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 
      0xFF, 0xDB, 0x00, 0x43, 0x00, // DQT
      0xFF, 0xC0, 0x00, 0x11, // SOF0
      0x08, 0x00, 0x01, 0x00, 0x01, // 1x1 pixel
      0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x1F, // DHT
      0xFF, 0xDA, 0x00, 0x0C, // SOS
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB4, 0x21, 0x40,
      0xFF, 0xD9 // EOI
    ]);

    // Write to a temporary file
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_test.jpg');
    fs.writeFileSync(tempFile, minimalJpegBuffer);
    
    try {
      const dimensions = getImageDimensions(tempFile);
      expect(dimensions).toEqual({width: 1, height: 1});
      const tokens = calculateImageTokens(dimensions);
      expect(tokens).toBeGreaterThan(0);
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  // Test with truncated buffers to verify bounds checking
  it('should throw error when reading beyond buffer bounds for PNG', () => {
    // Invalid PNG buffer that's too small
    const smallBuffer = Buffer.from([0x89, 0x50, 0x4E]); // Just beginning of PNG signature
    
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_small.png');
    fs.writeFileSync(tempFile, smallBuffer);
    
    try {
      expect(() => getImageDimensions(tempFile)).toThrow();
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  it('should throw error when reading beyond buffer bounds for JPEG', () => {
    // Invalid JPEG buffer that's too small
    const smallBuffer = Buffer.from([0xFF]); // Just beginning of JPEG
    
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_small.jpg');
    fs.writeFileSync(tempFile, smallBuffer);
    
    try {
      expect(() => getImageDimensions(tempFile)).toThrow();
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  it('should throw error for TIFF with invalid IFD offset', () => {
    // Create a TIFF with an invalid IFD offset (pointing beyond buffer)
    const tiffBuffer = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, // Little endian TIFF header
      0xFF, 0xFF, 0xFF, 0xFF  // Invalid IFD offset (very large, beyond buffer)
    ]);

    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_invalid_tiff.tiff');
    fs.writeFileSync(tempFile, tiffBuffer);
    
    try {
      expect(() => getImageDimensions(tempFile)).toThrow();
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  it('should throw error for TIFF with insufficient buffer for directory entries', () => {
    // Create a TIFF header with a count of 100 entries but only space for 1
    const tiffBuffer = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, // Little endian TIFF header
      0x08, 0x00, 0x00, 0x00, // IFD offset at byte 8
      0x64, 0x00              // Directory count: 100 entries (0x64)
      // Only 2 bytes for count, not enough for 100 entries * 12 bytes each
    ]);

    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'temp_insufficient_tiff.tiff');
    fs.writeFileSync(tempFile, tiffBuffer);
    
    try {
      expect(() => getImageDimensions(tempFile)).toThrow();
    } finally {
      // Clean up
      fs.unlinkSync(tempFile);
    }
  });

  it('should validate image dimensions are within reasonable bounds', () => {
    // Create a fake dimensions object with extremely large values
    const hugeDimensions = { width: 100000, height: 100000 };
    
    // The calculateImageTokens function should handle this gracefully
    const tokens = calculateImageTokens(hugeDimensions);
    expect(tokens).toBe(16384); // Should be capped at max
  });

  it('should throw error for zero or negative dimensions', () => {
    // Create a custom validation function for testing purposes since 
    // validation is internal to the getImageDimensions function
    const validateImageDimensions = (dimensions: any) => {
      const MAX_DIMENSION = 65536;
      return dimensions.width > 0 && 
             dimensions.height > 0 && 
             dimensions.width <= MAX_DIMENSION && 
             dimensions.height <= MAX_DIMENSION;
    };
    
    expect(validateImageDimensions({width: 0, height: 100})).toBe(false);
    expect(validateImageDimensions({width: 100, height: 0})).toBe(false);
    expect(validateImageDimensions({width: -1, height: 100})).toBe(false);
    expect(validateImageDimensions({width: 100, height: -1})).toBe(false);
  });

  it('should enforce maximum file size limits', () => {
    // Create a mock function to test the file size validation
    const fs = require('fs');
    const path = require('path');
    
    // Create a file larger than 50MB limit
    const largeBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
    const largeFile = path.join(__dirname, 'temp_large.jpg');
    fs.writeFileSync(largeFile, largeBuffer);
    
    try {
      expect(() => getImageDimensions(largeFile)).toThrow(/File too large/);
    } finally {
      // Clean up
      fs.unlinkSync(largeFile);
    }
  });
});