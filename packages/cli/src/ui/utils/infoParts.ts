/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LinkInfoPart, TextInfoPart } from '../types.js';

export const textInfoPart = (text: string): TextInfoPart => ({
  type: 'text',
  text,
});

export const linkInfoPart = (link: string): LinkInfoPart => ({
  type: 'link',
  value: link,
});
