/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Image, { TerminalInfoProvider } from 'ink-picture';
import type { ImageData, ImageResult } from '@google/gemini-cli-core';

export interface ImageDisplayProps {
  /** Image data to display */
  image: ImageData;
  /** Width in terminal cells (undefined = auto-fit to terminal width) */
  width?: number;
  /** Height in terminal cells (undefined = auto based on aspect ratio) */
  height?: number;
  /** Whether to preserve aspect ratio (default: true) */
  preserveAspectRatio?: boolean;
}

/**
 * Component that displays images in the terminal using ink-picture.
 * Supports both base64 encoded images and file paths.
 * Self-contained with its own TerminalInfoProvider wrapper.
 *
 * By default, images are displayed at their natural size or scaled to fit
 * the terminal width while preserving aspect ratio.
 */
export const ImageDisplay: React.FC<ImageDisplayProps> = ({
  image,
  width,
  height,
}) => {
  const { base64, filePath, mimeType, alt } = image;

  // Determine the image source
  let src: string | undefined;

  if (base64) {
    // Convert base64 to data URL
    const mime = mimeType || 'image/png';
    src = `data:${mime};base64,${base64}`;
  } else if (filePath) {
    src = filePath;
  }

  if (!src) {
    return (
      <Box>
        <Text color="yellow">[Image: Unable to display - no valid source]</Text>
      </Box>
    );
  }

  return (
    <TerminalInfoProvider>
      <Box flexDirection="column">
        <Image
          src={src}
          width={width}
          height={height}
          alt={alt || 'Generated image'}
        />
        {alt && (
          <Box marginTop={1}>
            <Text dimColor>{alt}</Text>
          </Box>
        )}
      </Box>
    </TerminalInfoProvider>
  );
};

/**
 * Type guard to check if an object contains image data
 */
export function isImageData(obj: unknown): obj is ImageData {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  // Use hasOwnProperty to safely check for properties
  const hasBase64 =
    Object.prototype.hasOwnProperty.call(obj, 'base64') &&
    typeof (obj as { base64?: unknown }).base64 === 'string';
  const hasFilePath =
    Object.prototype.hasOwnProperty.call(obj, 'filePath') &&
    typeof (obj as { filePath?: unknown }).filePath === 'string';
  return hasBase64 || hasFilePath;
}

/**
 * Type guard to check if an object is an image result from a tool
 */
export function isImageResult(obj: unknown): obj is ImageResult {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(obj, 'image')) {
    return false;
  }
  return isImageData((obj as { image?: unknown }).image);
}

// Re-export types for convenience
export type { ImageData, ImageResult } from '@google/gemini-cli-core';
