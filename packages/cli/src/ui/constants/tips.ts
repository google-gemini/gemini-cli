/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getInformativeTips } from '../../i18n/index.js';

/**
 * Informative tips shown during loading.
 * These are now loaded from i18n for localization support.
 *
 * Tips are stored in src/i18n/locales/en/loading.json under the "tips" key,
 * organized into categories: settings, shortcuts, and commands.
 *
 * @deprecated Import getInformativeTips from '../../i18n/index.js' directly
 */
export const INFORMATIVE_TIPS = getInformativeTips();
