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
 * Internal registry for tracking clipboard images.
 * Uses a Map for O(1) path lookup to prevent race conditions.
 */
interface ImageRegistry {
  /** Map from absolute path to ClipboardImage for O(1) duplicate detection */
  pathToImage: Map<string, ClipboardImage>;
  /** Ordered array of images for iteration */
  images: ClipboardImage[];
  /** Next sequential ID to assign */
  nextId: number;
}

/**
 * Creates an empty image registry.
 */
const createEmptyRegistry = (): ImageRegistry => ({
  pathToImage: new Map(),
  images: [],
  nextId: 1,
});

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
 *
 * Uses a Map-based registry with synchronized ref/state to prevent race conditions
 * when multiple images are registered rapidly (e.g., multi-file drag-and-drop).
 */
export function useClipboardImages(): UseClipboardImagesReturn {
  const [registry, setRegistryState] =
    useState<ImageRegistry>(createEmptyRegistry);
  const registryRef = useRef<ImageRegistry>(registry);

  // Custom setter that syncs ref and state atomically.
  // The ref is updated synchronously for immediate reads,
  // while state update is queued for React re-renders.
  const setRegistry = useCallback((newRegistry: ImageRegistry) => {
    registryRef.current = newRegistry;
    setRegistryState(newRegistry);
  }, []);

  /**
   * Register a new image and return its display text.
   * This function is idempotent: registering the same path twice returns
   * the same display text without creating a duplicate entry.
   */
  const registerImage = useCallback(
    (absolutePath: string): string => {
      // Read from ref for synchronous access to latest state
      const current = registryRef.current;

      // O(1) check for existing registration - makes this idempotent
      const existing = current.pathToImage.get(absolutePath);
      if (existing) {
        return existing.displayText;
      }

      // Assign ID and create image atomically
      const id = current.nextId;
      const displayText = `[Image #${id}]`;
      const newImage: ClipboardImage = { id, path: absolutePath, displayText };

      // Immutable Map update
      const newPathToImage = new Map(current.pathToImage);
      newPathToImage.set(absolutePath, newImage);

      const newRegistry: ImageRegistry = {
        pathToImage: newPathToImage,
        images: [...current.images, newImage],
        nextId: id + 1,
      };

      setRegistry(newRegistry);
      return displayText;
    },
    [setRegistry],
  );

  const clear = useCallback(() => {
    setRegistry(createEmptyRegistry());
  }, [setRegistry]);

  /**
   * Get image parts only for images whose [Image #N] tags are present in the text.
   * This prevents sending images the user has deleted from their prompt.
   */
  const getImagePartsForText = useCallback(
    async (text: string): Promise<PartUnion[]> => {
      // Use ref for synchronous access to current state
      const current = registryRef.current;
      const parts: PartUnion[] = [];

      for (const image of current.images) {
        // Use String.includes for faster tag checking (no regex compilation)
        if (!text.includes(image.displayText)) {
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
    [], // No dependencies - reads from ref for consistent access
  );

  return {
    images: registry.images,
    registerImage,
    clear,
    getImagePartsForText,
  };
}
