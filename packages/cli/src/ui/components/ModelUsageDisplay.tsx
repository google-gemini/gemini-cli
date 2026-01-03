/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo } from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { type RetrieveUserQuotaResponse } from '@google/gemini-cli-core';

export const ModelUsageDisplay = ({ model }: { model: string }) => {
  const config = useConfig();
  const { stats } = useSessionStats();
  const [quota, setQuota] = useState<RetrieveUserQuotaResponse | null>(null);

  // Calculate total API requests to detect when a response completes
  const totalApiRequests = useMemo(
    () =>
      Object.values(stats.metrics.models).reduce<number>(
        (sum, m) =>
          sum +
          ((m as { api?: { totalRequests?: number } })?.api?.totalRequests ??
            0),
        0,
      ),
    [stats.metrics.models],
  );

  useEffect(() => {
    let mounted = true;
    const fetchQuota = async () => {
      try {
        const q = await config.refreshUserQuota();
        if (mounted && q) {
          setQuota(q);
        }
      } catch (_e) {
        // Fail silently - quota display is optional
      }
    };
    void fetchQuota();
    return () => {
      mounted = false;
    };
  }, [config, totalApiRequests, stats.lastPromptTokenCount]); // Re-fetch after each API response and token count change

  const bucket = quota?.buckets?.find((b) => b.modelId === model);

  if (!bucket || bucket.remainingFraction === undefined) {
    return null;
  }

  const percentageLeft = (bucket.remainingFraction * 100).toFixed(1);

  return (
    <Text color={theme.text.secondary}>
      ({percentageLeft}% model usage left)
    </Text>
  );
};
