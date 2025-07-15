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

export const historyItemInfo = (...parts: InfoPart[]): HistoryItemInfo => ({
  type: 'info',
  parts,
  text: parts
    .map((part) => (part.type === 'text' ? part.text : part.value))
    .join(''),
});
