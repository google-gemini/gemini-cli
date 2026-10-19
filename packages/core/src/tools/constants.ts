/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export const DEFAULT_TOTAL_MAX_MATCHES = 100;
/**
 * Upper bound for the `total_max_matches` grep parameter. Without a ceiling the
 * model can request an arbitrarily large number of matches and defeat the
 * default cap, flooding the context window (see issue #17448).
 */
export const MAX_TOTAL_MAX_MATCHES = 5000;
export const DEFAULT_SEARCH_TIMEOUT_MS = 30000;
