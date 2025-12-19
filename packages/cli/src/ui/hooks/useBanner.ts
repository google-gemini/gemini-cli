/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { Config } from '@google/gemini-cli-core';

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

  const titleEscaped = !previewEnabled ? title.replace(/\\n/g, '\n') : '';

  const bodyEscaped = !previewEnabled ? body.replace(/\\n/g, '\n') : '';

  return {
    title: titleEscaped,
    body: bodyEscaped,
  };
}
