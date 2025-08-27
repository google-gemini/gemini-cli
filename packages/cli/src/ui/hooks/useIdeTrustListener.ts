/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import type { Config } from '@google/gemini-cli-core';

export function useIdeTrustListener(
  config: Config,
  onTrustChange: (isTrusted: boolean) => void,
) {
  useEffect(() => {
    const ideClient = config.getIdeClient();

    ideClient.addTrustChangeListener(onTrustChange);

    return () => {
      ideClient.removeTrustChangeListener(onTrustChange);
    };
  }, [config, onTrustChange]);
}
