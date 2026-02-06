/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { persistentState } from '../../utils/persistentState.js';
import crypto from 'node:crypto';

const DEFAULT_MAX_BANNER_SHOWN_COUNT = 5;

interface BannerData {
  defaultText: string;
  warningText: string;
}

export function useBanner(bannerData: BannerData) {
  const { defaultText, warningText } = bannerData;

  const [bannerCounts] = useState(
    () => persistentState.get('defaultBannerShownCount') || {},
  );

  const hashedText = crypto
    .createHash('sha256')
    .update(defaultText)
    .digest('hex');

  const currentBannerCount = bannerCounts[hashedText] || 0;

  const showDefaultBanner =
    warningText === '' && currentBannerCount < DEFAULT_MAX_BANNER_SHOWN_COUNT;

  const rawBannerText = showDefaultBanner ? defaultText : warningText;
  const bannerText = rawBannerText.replace(/\\n/g, '\n');

  const lastIncrementedKey = useRef<string | null>(null);

  useEffect(() => {
    if (showDefaultBanner && defaultText) {
      if (lastIncrementedKey.current !== defaultText) {
        lastIncrementedKey.current = defaultText;

        const allCounts = persistentState.get('defaultBannerShownCount') || {};
        const current = allCounts[hashedText] || 0;

        persistentState.set('defaultBannerShownCount', {
          ...allCounts,
          [hashedText]: current + 1,
        });
      }
    }
  }, [showDefaultBanner, defaultText, hashedText]);

  return {
    bannerText,
  };
}
