/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { persistentState } from '../../utils/persistentState.js';
import crypto from 'node:crypto';
import chalk from 'chalk';
import { getAntigravityCompatibility } from '../utils/antigravityUtils.js';

const DEFAULT_MAX_BANNER_SHOWN_COUNT = 5;

// Track banners incremented during this session to prevent multiple increments
// on React unmounts/remounts
const sessionIncrementedBanners = new Set<string>();

// For testing purposes
export function _clearSessionBannersForTest() {
  sessionIncrementedBanners.clear();
}

interface BannerData {
  defaultText: string;
  warningText: string;
}

export function useBanner(bannerData: BannerData) {
  const { defaultText, warningText } = bannerData;

  const [bannerCounts] = useState(
    () => persistentState.get('defaultBannerShownCount') || {},
  );

  const activeText = warningText ? warningText : defaultText;

  const hashedText = crypto
    .createHash('sha256')
    .update(activeText)
    .digest('hex');

  const currentBannerCount = bannerCounts[hashedText] || 0;

  const showBanner =
    activeText !== '' &&
    (currentBannerCount < DEFAULT_MAX_BANNER_SHOWN_COUNT ||
      activeText.includes('Antigravity'));

  const rawBannerText = showBanner ? activeText : '';
  let bannerText = rawBannerText.replace(/\\n/g, '\n');

  if (showBanner && activeText.includes('Antigravity')) {
    const compat = getAntigravityCompatibility();

    if (!compat.cpuCompatible) {
      // CPU lacks required instruction sets — show a hardware warning
      // instead of the install command so users aren't told to install
      // a binary that will crash immediately with SIGILL.
      bannerText += `\n \n${chalk.yellow('⚠ Your CPU is not compatible with the Antigravity CLI binary.')}`;
      bannerText += `\n${chalk.dim(compat.incompatibilityReason)}`;
      bannerText += `\n${chalk.dim('You can continue using Gemini CLI (Node.js) on this machine.')}`;
    } else if (compat.installInfo) {
      bannerText += `\n \nTo install run "${chalk.bold(compat.installInfo.installCmd)}"`;
    }
  }

  useEffect(() => {
    if (showBanner && activeText) {
      if (!sessionIncrementedBanners.has(activeText)) {
        sessionIncrementedBanners.add(activeText);

        const allCounts = persistentState.get('defaultBannerShownCount') || {};
        const current = allCounts[hashedText] || 0;

        persistentState.set('defaultBannerShownCount', {
          ...allCounts,
          [hashedText]: current + 1,
        });
      }
    }
  }, [showBanner, activeText, hashedText]);

  return {
    bannerText,
  };
}
