/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  ExpandablePrompt,
  DEFAULT_MAX_WIDTH,
} from './shared/ExpandablePrompt.js';

export const MAX_WIDTH = DEFAULT_MAX_WIDTH;

export interface PrepareLabelProps {
  label: string;
  matchedIndex?: number;
  userInput: string;
  textColor: string;
  isExpanded?: boolean;
}

export const PrepareLabel: React.FC<PrepareLabelProps> = (props) => (
  <ExpandablePrompt {...props} />
);
