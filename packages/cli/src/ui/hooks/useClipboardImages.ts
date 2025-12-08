/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PartUnion } from '@google/genai';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * Represents a clipboard image that has been pasted into the input.
 */
export interface ClipboardImage {
  /** Sequential ID for this image within the current message */
  id: number;
  /** Absolute path to the image file */
  path: string;
  /** Display text shown in the input (e.g., "[Image #1]") */
  displayText: string;
}

/**
 * Return type for the useClipboardImages hook.
 */
export interface UseClipboardImagesReturn {
  /** Array of registered clipboard images for the current message */
  images: ClipboardImage[];
  /** Register a new image and return its display text (e.g., "[Image #1]") */
  registerImage: (absolutePath: string) => string;
  /** Clear all images (called after message submission) */
  clear: () => void;
  /** Get all images as base64-encoded PartUnion objects for injection into the prompt */
  getImageParts: () => Promise<PartUnion[]>;
  /** Get image parts only for images whose [Image #N] tags are present in the text */
  getImagePartsForText: (text: string) => Promise<PartUnion[]>;
}

/**
 * Gets the MIME type for an image file based on its extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.tiff': 'image/tiff',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Hook to manage clipboard images pasted into the input.
 *
 * This hook provides a registry for tracking pasted images and converting them
 * to base64-encoded parts for injection into the Gemini prompt.
 *
 * The image counter resets after each message submission.
 */
export function useClipboardImages(): UseClipboardImagesReturn {
  const [images, setImages] = useState<ClipboardImage[]>([]);
  const nextIdRef = useRef(1);

  const registerImage = useCallback((absolutePath: string): string => {
    const id = nextIdRef.current++;
    const displayText = `[Image #${id}]`;

    setImages((prev) => [
      ...prev,
      {
        id,
        path: absolutePath,
        displayText,
      },
    ]);

    return displayText;
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    nextIdRef.current = 1;
  }, []);

  const getImageParts = useCallback(async (): Promise<PartUnion[]> => {
    const parts: PartUnion[] = [];

    for (const image of images) {
      try {
        const fileContent = await fs.readFile(image.path);
        const mimeType = getMimeType(image.path);

        parts.push({
          inlineData: {
            data: fileContent.toString('base64'),
            mimeType,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLogger.warn(
          `Failed to load clipboard image ${image.displayText} from ${image.path}: ${message}`,
        );
        // Continue with remaining images - don't fail the whole submission
      }
    }

    return parts;
  }, [images]);

  /**
   * Get image parts only for images whose [Image #N] tags are present in the text.
   * This prevents sending images the user has deleted from their prompt.
   */
  const getImagePartsForText = useCallback(
    async (text: string): Promise<PartUnion[]> => {
      const parts: PartUnion[] = [];

      for (const image of images) {
        // Check if this image's tag exists in the text
        const tagPattern = new RegExp(`\\[Image #${image.id}\\]`);
        if (!tagPattern.test(text)) {
          // Tag was deleted - skip this image
          continue;
        }

        try {
          const fileContent = await fs.readFile(image.path);
          const mimeType = getMimeType(image.path);

          parts.push({
            inlineData: {
              data: fileContent.toString('base64'),
              mimeType,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          debugLogger.warn(
            `Failed to load clipboard image ${image.displayText} from ${image.path}: ${message}`,
          );
          // Continue with remaining images - don't fail the whole submission
        }
      }

      return parts;
    },
    [images],
  );

  return {
    images,
    registerImage,
    clear,
    getImageParts,
    getImagePartsForText,
  };
}
