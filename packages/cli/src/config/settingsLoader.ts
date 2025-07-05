/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { Settings } from './settings.js';


export function getDefaultSettings(): Settings {
  return {
    selectedAuthType: AuthType.LOGIN_WITH_GOOGLE_PERSONAL, // Default to personal Google account login
  };
}
