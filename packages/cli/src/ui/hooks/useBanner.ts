/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import type { Config } from '@google/gemini-cli-core';
import crypto from 'node:crypto';
import { persistentState } from '../../utils/persistentState.js';

const DEFAULT_MAX_BANNER_SHOWN_COUNT = 5;

interface BannerContent {
  title: string;
  body: string;
}

export interface BannerData {
  bannerText: BannerContent;
  isWarning: boolean;
}

export function useBanner(bannerData: BannerData, config: Config) {
  const [previewEnabled, setPreviewEnabled] = useState(
    config.getPreviewFeatures(),
  );

  const { title, body } = bannerData.bannerText;

  useEffect(() => {
    const isEnabled = config.getPreviewFeatures();
    if (isEnabled !== previewEnabled) {
      setPreviewEnabled(isEnabled);
    }
  }, [config, previewEnabled]);

  const [bannerCounts] = useState(
    () => persistentState.get('defaultBannerShownCount') || {},
  );
  const defaultText = title + body;
  const hashedText = crypto
    .createHash('sha256')
    .update(defaultText)
    .digest('hex');

  const currentBannerCount = bannerCounts[hashedText] || 0;

  const showBanner =
    !previewEnabled && currentBannerCount < DEFAULT_MAX_BANNER_SHOWN_COUNT;

  const lastIncrementedKey = useRef<string | null>(null);

  useEffect(() => {
    if (showBanner && defaultText) {
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
  }, [showBanner, defaultText, hashedText]);

  const titleEscaped = showBanner ? title.replace(/\\n/g, '\n') : '';

  const bodyEscaped = showBanner ? body.replace(/\\n/g, '\n') : '';

  return {
    title: titleEscaped,
    body: bodyEscaped,
  };
}
