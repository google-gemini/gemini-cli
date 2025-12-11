/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { Config } from '@google/gemini-cli-core';

export interface BannerData {
  bannerText: string;
  isWarning: boolean;
}

export function useBanner(bannerData: BannerData, config: Config) {
  const [previewEnabled, setPreviewEnabled] = useState(
    config.getPreviewFeatures(),
  );

  const { bannerText } = bannerData;

  useEffect(() => {
    const isEnabled = config.getPreviewFeatures();
    if (isEnabled !== previewEnabled) {
      setPreviewEnabled(isEnabled);
    }
  }, [config, previewEnabled]);

  const bannerTextEscaped = !previewEnabled
    ? bannerText.replace(/\\n/g, '\n')
    : '';

  return {
    bannerText: bannerTextEscaped,
  };
}
