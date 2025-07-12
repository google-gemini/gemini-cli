/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-20
 */

import * as Diff from 'diff';

export const DEFAULT_DIFF_OPTIONS: Diff.PatchOptions = {
  context: 3,
  ignoreWhitespace: true,
};
