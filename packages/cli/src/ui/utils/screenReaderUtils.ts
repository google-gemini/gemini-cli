/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions for improving screen reader accessibility
 */

/**
 * Announces status changes to screen readers by writing to stdout
 * @param message The message to announce
 * @param isReaderMode Whether reader mode is enabled
 */
export function announceToScreenReader(
  message: string,
  isReaderMode: boolean,
): void {
  if (isReaderMode && message) {
    // Write announcement to stdout for screen readers
    process.stdout.write(`\n[GEMINI]: ${message}\n`);
  }
}

/**
 * Formats status updates for better screen reader comprehension
 * @param status The status to format
 * @param isReaderMode Whether reader mode is enabled
 */
export function formatStatusForScreenReader(
  status: string,
  isReaderMode: boolean,
): string {
  if (!isReaderMode) {
    return status;
  }

  // Remove ALL visual characters and decorative elements for screen readers
  return status
    .replace(/[█▌▐▀▄▶▷◀◁⏸⏯⏹⏺]/g, '') // Remove block characters
    .replace(/[→←↑↓]/g, '') // Remove arrows
    .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '') // Remove spinner characters
    .replace(/[┌┐└┘│─├┤┬┴┼]/g, '') // Remove box drawing characters
    .replace(/[╭╮╯╰│─├┤┬┴┼]/g, '') // Remove rounded box characters
    .replace(/[⚡✓✗❌⚠️]/g, '') // Remove symbols
    .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI escape codes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Provides simplified text alternatives for complex visual elements
 * @param visualElement The visual element description
 * @param isReaderMode Whether reader mode is enabled
 */
export function getTextAlternative(
  visualElement: string,
  isReaderMode: boolean,
): string {
  if (!isReaderMode) {
    return visualElement;
  }

  // Provide text alternatives for common visual elements
  const alternatives: Record<string, string> = {
    'thinking...': 'Processing your request',
    'loading...': 'Please wait',
    error: 'Error occurred',
    warning: 'Warning',
    info: 'Information',
    success: 'Operation completed successfully',
  };

  const simplified = visualElement.toLowerCase().trim();
  return alternatives[simplified] || visualElement;
}
