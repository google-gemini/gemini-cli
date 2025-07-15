/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HistoryItemInfo,
  InfoPart,
  LinkInfoPart,
  TextInfoPart,
} from '../types.js';

export const textInfoPart = (text: string): TextInfoPart => ({
  type: 'text',
  text,
});

export const linkInfoPart = (link: string): LinkInfoPart => ({
  type: 'link',
  value: link,
});

/**
 * Creates a history item with informational content.
 *
 * This function constructs a `HistoryItemInfo` object, which is used to display
 * informational messages in the chat history. It can combine multiple parts,
 * such as plain text and links, into a single history item.
 *
 * @param parts - A variable number of `InfoPart` objects. Each part can be
 *   either a `TextInfoPart` (for plain text) or a `LinkInfoPart` (for URLs).
 * @returns A `HistoryItemInfo` object.
 */
export const historyItemInfo = (...parts: InfoPart[]): HistoryItemInfo => ({
  type: 'info',
  parts,
  text: parts
    .map((part) => (part.type === 'text' ? part.text : part.value))
    .join(''),
});
