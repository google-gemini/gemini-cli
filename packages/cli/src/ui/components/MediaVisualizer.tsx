/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import terminalImage from 'terminal-image';

export interface MediaVisualizerProps {
  /**
   * Absolute or relative path to the image file.
   */
  imagePath?: string;
  /**
   * Image buffer (optional, takes precedence over imagePath).
   */
  imageBuffer?: Buffer;
  /**
   * Width of the rendered image. Defaults to standard terminal-image sizing.
   */
  width?: string | number;
  /**
   * Height of the rendered image.
   */
  height?: string | number;
  /**
   * If true, tries to maintain aspect ratio (default: true for terminal-image)
   */
  preserveAspectRatio?: boolean;
}

/**
 * A fallback universal media visualizer that renders image content
 * as ANSI block characters in the terminal using terminal-image.
 */
export const MediaVisualizer: React.FC<MediaVisualizerProps> = ({
  imagePath,
  imageBuffer,
  width,
  height,
  preserveAspectRatio = true,
}) => {
  const [renderedContent, setRenderedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const renderImage = async () => {
      try {
        const options = { width, height, preserveAspectRatio };
        let result = '';

        if (imageBuffer) {
          result = await terminalImage.buffer(imageBuffer, options);
        } else if (imagePath) {
          // LFI / Path Traversal Remediation
          const { promises: fs } = await import('node:fs');
          const path = await import('node:path');

          let resolvedPath: string;
          try {
            resolvedPath = path.resolve(imagePath);
            const stats = await fs.stat(resolvedPath);
            if (!stats.isFile()) {
              throw new Error('Not a direct file');
            }
          } catch (e) {
            throw new Error(`Invalid or inaccessible image path: ${imagePath}`);
          }

          result = await terminalImage.file(resolvedPath, options);
        } else {
          return;
        }

        if (!isCancelled) {
          setRenderedContent(result);
          setError(null);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`[Image Render Error: ${message}]`);
        }
      }
    };

    void renderImage();

    return () => {
      isCancelled = true;
    };
  }, [imagePath, imageBuffer, width, height, preserveAspectRatio]);

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (!renderedContent) {
    return (
      <Box>
        <Text dimColor>Loading image...</Text>
      </Box>
    );
  }

  // terminal-image outputs VT100/ANSI color blocks
  return (
    <Box flexDirection="column">
      <Text>{renderedContent}</Text>
    </Box>
  );
};
