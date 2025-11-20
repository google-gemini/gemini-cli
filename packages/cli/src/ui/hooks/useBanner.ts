/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';
import { persistentState } from '../../utils/persistentState.js';
import type { Config } from '@google/gemini-cli-core';

function hasVersionPrefix(str: string) {
  const versionPrefixRegex = /^v\d+:/;
  return versionPrefixRegex.test(str);
}

interface BannerData {
  defaultText: string;
  warningText: string;
}

export function useBanner(bannerData: BannerData, config: Config) {
  const { defaultText, warningText } = bannerData;

  const [previewEnabled, setPreviewEnabled] = useState(
    config.getPreviewFeatures(),
  );

  useEffect(() => {
    const isEnabled = config.getPreviewFeatures();
    if (isEnabled !== previewEnabled) {
      setPreviewEnabled(isEnabled);
    }
  }, [config, previewEnabled]);

  const [bannerCounts] = useState(
    () => persistentState.get('defaultBannerShownCount') || {},
  );

  const { currentBannerVersion, defaultTextDelimited, maxBannerShownCount } =
    useMemo(() => {
      if (hasVersionPrefix(defaultText)) {
        const parts = defaultText.split(':');
        return {
          currentBannerVersion: parts[0],
          maxBannerShownCount: parseInt(parts[1], 10),
          defaultTextDelimited: parts.slice(2).join('').trim(),
        };
      }
      return {
        currentBannerVersion: 'v0',
        defaultTextDelimited: defaultText,
        maxBannerShownCount: 5,
      };
    }, [defaultText]);

  const currentBannerCount = bannerCounts[currentBannerVersion] || 0;

  const showDefaultBanner =
    warningText === '' &&
    !previewEnabled &&
    currentBannerCount < maxBannerShownCount;

  const rawBannerText = showDefaultBanner ? defaultTextDelimited : warningText;
  const bannerText = rawBannerText.replace(/\\n/g, '\n');

  const defaultColor = Colors.AccentBlue;
  const bannerColor = warningText === '' ? defaultColor : theme.status.warning;

  const lastIncrementedKey = useRef<string | null>(null);

  useEffect(() => {
    if (showDefaultBanner && defaultText) {
      if (lastIncrementedKey.current !== defaultText) {
        lastIncrementedKey.current = defaultText;

        const allCounts = persistentState.get('defaultBannerShownCount') || {};
        const current = allCounts[currentBannerVersion] || 0;

        persistentState.set('defaultBannerShownCount', {
          ...allCounts,
          [currentBannerVersion]: current + 1,
        });
      }
    }
  }, [showDefaultBanner, defaultText, currentBannerVersion]);

  return {
    bannerText,
    bannerColor,
  };
}
