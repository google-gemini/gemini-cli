/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync } from '@google/gemini-cli-core';
import process from 'node:process';
import { type StatusBadge } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';

export function useStatusBadges(): StatusBadge[] {
  const [badges, setBadges] = useState<StatusBadge[]>([]);

  const fetchBadges = useCallback(async () => {
    const newBadges: StatusBadge[] = [];

    // 1. GCloud
    try {
      // Get active config and project in one go or separate
      const { stdout: projectStdout } = await spawnAsync('gcloud', [
        'config',
        'get-value',
        'project',
      ]);
      const project = projectStdout.toString().trim();

      if (project && !project.includes('(unset)')) {
        const { stdout: configStdout } = await spawnAsync('gcloud', [
          'config',
          'configurations',
          'list',
          '--filter',
          'IS_ACTIVE=true',
          '--format',
          'value(name)',
        ]);
        const activeConfig = configStdout.toString().trim();

        newBadges.push({
          text: `gcloud(${activeConfig || 'default'}):${project}`,
          color: theme.text.accent,
        });
      }
    } catch (_e) {
      // Ignore errors if gcloud is not installed or configured
    }

    // 2. Python Venv
    const venvPath = process.env['VIRTUAL_ENV'];
    if (venvPath) {
      const venvName = venvPath.split('/').pop();
      newBadges.push({
        text: `venv:${venvName}`,
        color: theme.status.warning,
      });
    }

    setBadges(newBadges);
  }, []);

  useEffect(() => {
    // Initial fetch
    void fetchBadges();

    // Poll every 30 seconds to be respectful of resources
    const interval = setInterval(() => {
      void fetchBadges();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchBadges]);

  return badges;
}
