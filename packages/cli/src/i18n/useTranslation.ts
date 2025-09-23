/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation as useI18nTranslation } from 'react-i18next';

// Phase 1: Real useTranslation hook with English-only locale
export const useTranslation = (namespace = 'common') =>
  useI18nTranslation(namespace);
