/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

/**
 * Checks if a file path refers to an image based on extension
 */
function isImagePath(filePath: string): boolean {
  const imageExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
  ];
  const ext = path.extname(filePath).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Formats a user message by replacing image @ commands with clean [Image #N] placeholders
 * while keeping the original @ commands for processing.
 * Images are numbered sequentially starting from 1.
 * @param text The text to format
 * @param startingImageNumber The number to start counting from (for continuing sequences)
 */
export function formatUserMessageForDisplay(
  text: string,
  startingImageNumber: number = 1,
): string {
  let imageCounter = startingImageNumber;

  // First pass: find all image @ commands and create a mapping
  const imageReplacements = new Map<string, string>();
  const regex = /@([^\s]+(?:\\ [^\s]*)*)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const filePath = match[1];
    const cleanPath = filePath.replace(/\\ /g, ' ');

    if (isImagePath(cleanPath) && !imageReplacements.has(fullMatch)) {
      imageReplacements.set(fullMatch, `[Image #${imageCounter++}]`);
    }
  }

  // Second pass: replace all @ commands
  return text.replace(/@([^\s]+(?:\\ [^\s]*)*)/g, (match, filePath) => {
    const cleanPath = filePath.replace(/\\ /g, ' ');

    if (isImagePath(cleanPath)) {
      return imageReplacements.get(match) || match;
    }

    // Keep non-image @ commands as-is
    return match;
  });
}

/**
 * Maps a cursor position in the original text to the corresponding position in the formatted text
 * @param originalText The original text
 * @param cursorPos The cursor position in the original text
 * @param startingImageNumber The number to start counting from (for continuing sequences)
 */
export function mapCursorPosition(
  originalText: string,
  cursorPos: number,
  startingImageNumber: number = 1,
): number {
  // If cursor is before any @ commands, no mapping needed
  if (cursorPos === 0) return 0;

  // First pass: create the same image replacement mapping as formatUserMessageForDisplay
  let imageCounter = startingImageNumber;
  const imageReplacements = new Map<string, string>();
  const regex = /@([^\s]+(?:\\ [^\s]*)*)/g;
  let match;

  // Reset regex
  regex.lastIndex = 0;
  while ((match = regex.exec(originalText)) !== null) {
    const fullMatch = match[0];
    const filePath = match[1];
    const cleanPath = filePath.replace(/\\ /g, ' ');

    if (isImagePath(cleanPath) && !imageReplacements.has(fullMatch)) {
      imageReplacements.set(fullMatch, `[Image #${imageCounter++}]`);
    }
  }

  // Second pass: calculate cursor position with replacements
  let offset = 0;
  regex.lastIndex = 0; // Reset regex

  while ((match = regex.exec(originalText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    // If cursor is before this match, we're done
    if (cursorPos <= matchStart) {
      break;
    }

    // Check if this is an image path
    const cleanPath = match[1].replace(/\\ /g, ' ');
    if (isImagePath(cleanPath)) {
      const replacement = imageReplacements.get(match[0]) || match[0];
      const lengthDifference = match[0].length - replacement.length;

      // If cursor is within this match, place it at the end of the replacement
      if (cursorPos >= matchStart && cursorPos <= matchEnd) {
        return matchStart - offset + replacement.length;
      }

      // If cursor is after this match, accumulate the offset
      if (cursorPos > matchEnd) {
        offset += lengthDifference;
      }
    }
  }

  // Return cursor position adjusted by total offset
  return Math.max(0, cursorPos - offset);
}

/**
 * Counts the number of images in previous user messages to determine the starting number for new images
 */
export function countImagesInHistory(userMessages: readonly string[]): number {
  let totalImages = 0;

  for (const message of userMessages) {
    const regex = /@([^\s]+(?:\\ [^\s]*)*)/g;
    let match;

    while ((match = regex.exec(message)) !== null) {
      const filePath = match[1];
      const cleanPath = filePath.replace(/\\ /g, ' ');

      if (isImagePath(cleanPath)) {
        totalImages++;
      }
    }
  }

  return totalImages + 1; // Return the next number to use
}

