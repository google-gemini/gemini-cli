/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync, type Config } from '@google/gemini-cli-core';
import { type StatusBadge } from '../contexts/UIStateContext.js';
import * as path from 'node:path';

export function useExtensionStatusBadges(config: Config): StatusBadge[] {
  const [badges, setBadges] = useState<StatusBadge[]>([]);

  const fetchBadges = useCallback(async () => {
    const activeExtensions = config
      .getExtensionLoader()
      .getExtensions()
      .filter(
        (ext) => ext.isActive && ext.ui?.badges && ext.ui.badges.length > 0,
      );

    const badgePromises = activeExtensions.flatMap((ext) => {
      if (!ext.ui?.badges) return [];

      return ext.ui.badges.map(
        async (badgeConfig): Promise<StatusBadge | null> => {
          try {
            let val: string | undefined;

            if (badgeConfig.type === 'env' && badgeConfig.envVar) {
              val = process.env[badgeConfig.envVar];
            } else if (badgeConfig.type === 'command' && badgeConfig.command) {
              const { stdout } = await spawnAsync(
                badgeConfig.command,
                badgeConfig.args ?? [],
              );
              val = stdout.toString().trim();
            }

            if (val) {
              if (badgeConfig.format === 'basename') {
                val = path.basename(val);
              }
              return {
                text: badgeConfig.icon ? `${badgeConfig.icon} ${val}` : val,
                color: badgeConfig.color,
              };
            }
          } catch (_e) {
            // Ignore failing badge commands silently so they don't break the UI
          }
          return null;
        },
      );
    });

    const results = await Promise.allSettled(badgePromises);
    const newBadges: StatusBadge[] = results
      .filter(
        (result): result is PromiseFulfilledResult<StatusBadge> =>
          result.status === 'fulfilled' && result.value !== null,
      )
      .map((result) => result.value);

    setBadges(newBadges);
  }, [config]);

  useEffect(() => {
    void fetchBadges();

    // Poll every 30 seconds for all extension badges
    // Future enhancement: Respect `intervalMs` from individual badge configs
    const interval = setInterval(() => {
      void fetchBadges();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchBadges]);

  return badges;
}
