/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamingState } from '../ui/types.js';

export interface TerminalTitleOptions {
  streamingState: StreamingState;
  thoughtSubject?: string;
  isConfirming: boolean;
  folderName: string;
  showThoughts: boolean;
  useDynamicTitle: boolean;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen - 1) + '…';
}

/**
 * Computes the dynamic terminal window title based on the current CLI state.
 *
 * @param options - The current state of the CLI and environment context
 * @returns A formatted string padded to 80 characters for the terminal title
 */
export function computeTerminalTitle({
  streamingState,
  thoughtSubject,
  isConfirming,
  folderName,
  showThoughts,
  useDynamicTitle,
}: TerminalTitleOptions): string {
  const MAX_LEN = 80;

  // Use CLI_TITLE env var if available, otherwise use the provided folder name
  let displayContext = process.env['CLI_TITLE'] || folderName;

  if (!useDynamicTitle) {
    const base = 'Gemini CLI ';
    // Max context length is 80 - base.length - 2 (for brackets)
    const maxContextLen = MAX_LEN - base.length - 2;
    displayContext = truncate(displayContext, maxContextLen);
    return `${base}(${displayContext})`.padEnd(MAX_LEN, ' ');
  }

  // Pre-calculate suffix but keep it flexible
  const getSuffix = (context: string) => ` (${context})`;

  let title;
  if (
    isConfirming ||
    streamingState === StreamingState.WaitingForConfirmation
  ) {
    const base = '✋  Action Required';
    // Max context length is 80 - base.length - 3 (for ' (' and ')')
    const maxContextLen = MAX_LEN - base.length - 3;
    const context = truncate(displayContext, maxContextLen);
    title = `${base}${getSuffix(context)}`;
  } else if (streamingState === StreamingState.Idle) {
    const base = '◇  Ready';
    // Max context length is 80 - base.length - 3 (for ' (' and ')')
    const maxContextLen = MAX_LEN - base.length - 3;
    const context = truncate(displayContext, maxContextLen);
    title = `${base}${getSuffix(context)}`;
  } else {
    // Active/Working state
    const cleanSubject =
      showThoughts && thoughtSubject?.replace(/[\r\n]+/g, ' ').trim();

    // If we have a thought subject and it's too long to fit with the suffix,
    // we drop the suffix to maximize space for the thought.
    // Otherwise, we keep the suffix.
    const suffix = getSuffix(displayContext);
    const suffixLen = suffix.length;
    const canFitThoughtWithSuffix = cleanSubject
      ? cleanSubject.length + suffixLen + 3 <= MAX_LEN
      : true;

    let activeSuffix = '';
    let maxStatusLen = MAX_LEN - 3; // Subtract icon prefix "✦  " (3 chars)

    if (!cleanSubject || canFitThoughtWithSuffix) {
      activeSuffix = suffix;
      maxStatusLen -= activeSuffix.length;
    }

    const displayStatus = cleanSubject
      ? truncate(cleanSubject, maxStatusLen)
      : 'Working…';

    title = `✦  ${displayStatus}${activeSuffix}`;
  }

  // Remove control characters that could cause issues in terminal titles
  // eslint-disable-next-line no-control-regex
  const safeTitle = title.replace(/[\x00-\x1F\x7F]/g, '');

  // Pad the title to a fixed width to prevent taskbar icon resizing/jitter.
  // We also slice it to ensure it NEVER exceeds MAX_LEN.
  return safeTitle.padEnd(MAX_LEN, ' ').substring(0, MAX_LEN);
}
