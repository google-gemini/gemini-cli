/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DOMElement } from 'ink';

export const isDOMElement = (node: unknown): node is DOMElement =>
  Boolean(
    node &&
      typeof node === 'object' &&
      'nodeName' in node &&
      (node as { nodeName?: unknown }).nodeName !== '#text',
  );
