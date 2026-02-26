/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync, type Config } from '@google/gemini-cli-core';
import { type StatusBadge } from '../contexts/UIStateContext.js';

export function useExtensionStatusBadges(config: Config): StatusBadge[] {
  const [badges, setBadges] = useState<StatusBadge[]>([]);

  const fetchBadges = useCallback(async () => {
    const activeExtensions = config
      .getExtensionLoader()
      .getExtensions()
      .filter((ext) => ext.isActive && ext.ui?.badges && ext.ui.badges.length > 0);

    const newBadges: StatusBadge[] = [];

    const badgePromises = activeExtensions.flatMap((ext) => {
      if (!ext.ui?.badges) return [];

      return ext.ui.badges.map(async (badgeConfig) => {
        try {
          const { stdout } = await spawnAsync(
            badgeConfig.command,
            badgeConfig.args ?? [],
          );
          const text = stdout.toString().trim();
          if (text) {
            newBadges.push({
              text: badgeConfig.icon ? `${badgeConfig.icon} ${text}` : text,
              color: badgeConfig.color,
            });
          }
        } catch (_e) {
          // Ignore failing badge commands silently so they don't break the UI
        }
      });
    });

    await Promise.allSettled(badgePromises);
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
