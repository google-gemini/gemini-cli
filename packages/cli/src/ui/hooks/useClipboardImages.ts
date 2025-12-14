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
import { IMAGE_EXTENSIONS } from '../utils/clipboardUtils.js';

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
  /** Get image parts only for images whose [Image #N] tags are present in the text */
  getImagePartsForText: (text: string) => Promise<PartUnion[]>;
}

/**
 * MIME types supported by Gemini API for image inputs.
 * See: https://ai.google.dev/gemini-api/docs/image-understanding
 */
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? null;
}

/**
 * Reads an image file and returns it as a base64-encoded PartUnion.
 * Returns null if the file cannot be read or has an unsupported format.
 */
async function readImageAsPart(
  imagePath: string,
  displayText: string,
): Promise<PartUnion | null> {
  const mimeType = getMimeType(imagePath);
  if (!mimeType) {
    const ext = path.extname(imagePath);
    debugLogger.warn(
      `Unsupported image format ${ext} for ${displayText}, skipping. Supported: ${IMAGE_EXTENSIONS.join(', ')}`,
    );
    return null;
  }

  try {
    const fileContent = await fs.readFile(imagePath);
    return {
      inlineData: {
        data: fileContent.toString('base64'),
        mimeType,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLogger.warn(
      `Failed to load clipboard image ${displayText} from ${imagePath}: ${message}`,
    );
    return null;
  }
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
    // Generate ID atomically with state update to prevent race conditions
    // when multiple images are registered rapidly (e.g., multi-file drag-and-drop)
    const id = nextIdRef.current++;
    const displayText = `[Image #${id}]`;

    setImages((prev) => {
      // Check if this path is already registered to prevent duplicates
      if (prev.some((img) => img.path === absolutePath)) {
        return prev;
      }
      return [
        ...prev,
        {
          id,
          path: absolutePath,
          displayText,
        },
      ];
    });

    return displayText;
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    nextIdRef.current = 1;
  }, []);

  /**
   * Get image parts only for images whose [Image #N] tags are present in the text.
   * This prevents sending images the user has deleted from their prompt.
   */
  const getImagePartsForText = useCallback(
    async (text: string): Promise<PartUnion[]> => {
      const parts: PartUnion[] = [];

      for (const image of images) {
        // Use String.includes for faster tag checking (no regex compilation)
        if (!text.includes(`[Image #${image.id}]`)) {
          // Tag was deleted - skip this image
          continue;
        }

        const part = await readImageAsPart(image.path, image.displayText);
        if (part) {
          parts.push(part);
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
    getImagePartsForText,
  };
}
