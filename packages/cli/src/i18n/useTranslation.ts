/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation as useI18nTranslation } from 'react-i18next';

export const useTranslation = (namespace = 'help') =>
  useI18nTranslation(namespace);

// Language switching utility for CLI environment
export const switchLanguage = (lng: string) => {
  // Language switching in CLI should be handled through:
  // 1. GEMINI_LANG environment variable
  // 2. Configuration file settings
  // 3. Command line arguments
  // This function serves as a placeholder for future implementation
  console.log(`Language switch requested: ${lng}`);
};
