/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTwoFilesPatch } from 'diff';

// This file contains the default options for generating diffs using the 'diff' library.
type PatchOptions = {
  context?: number;
  ignoreWhitespace?: boolean;
};

export const DEFAULT_DIFF_OPTIONS: PatchOptions = {
  context: 3,
  ignoreWhitespace: true,
};
