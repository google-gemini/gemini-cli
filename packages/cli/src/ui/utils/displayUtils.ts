/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { theme } from '../semantic-colors.js';

// --- Thresholds ---
export const TOOL_SUCCESS_RATE_HIGH = 95;
export const TOOL_SUCCESS_RATE_MEDIUM = 85;

export const USER_AGREEMENT_RATE_HIGH = 75;
export const USER_AGREEMENT_RATE_MEDIUM = 45;

export const CACHE_EFFICIENCY_HIGH = 40;
export const CACHE_EFFICIENCY_MEDIUM = 15;

// --- Color Logic ---
export const getStatusColor = (
  value: number,
  thresholds: { green: number; yellow: number; red?: number },
  options: { defaultColor?: string } = {},
) => {
  if (value >= thresholds.green) {
    return theme.status.success;
  }
  if (value >= thresholds.yellow) {
    return theme.status.warning;
  }
  if (thresholds.red != null && value >= thresholds.red) {
    return theme.status.error;
  }
  return options.defaultColor ?? theme.status.error;
};
