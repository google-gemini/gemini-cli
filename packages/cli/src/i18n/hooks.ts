/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from './index.js';

/**
 * Hook to access i18n translation functions
 */
export function useI18n() {
  return {
    t: i18n.t.bind(i18n),
    setLanguage: i18n.setLanguage.bind(i18n),
    getCurrentLanguage: i18n.getCurrentLanguage.bind(i18n),
  };
}
