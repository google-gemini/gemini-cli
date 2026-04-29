/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { persistentState } from '../../utils/persistentState.js';
import crypto from 'node:crypto';

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
    activeText !== '' && currentBannerCount < DEFAULT_MAX_BANNER_SHOWN_COUNT;

  const rawBannerText = showBanner ? activeText : '';
  const bannerText = rawBannerText.replace(/\\n/g, '\n');

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
