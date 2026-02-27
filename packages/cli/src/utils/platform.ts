/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

/**
 * Whether the current platform is Android (Termux).
 */
export const isAndroid = os.platform() === 'android';
