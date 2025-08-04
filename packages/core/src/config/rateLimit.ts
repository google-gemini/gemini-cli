/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthTier } from '../utils/rateLimiter.js';

export interface RateLimitSettings {
  enabled?: boolean;
  tier?: AuthTier;
}
