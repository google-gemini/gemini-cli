/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync } from '@google/gemini-cli-core';

export interface PullRequestInfo {
  number: number;
  url: string;
}

export function usePullRequestInfo(cwd: string, branchName: string | undefined): PullRequestInfo | undefined {
  const [prInfo, setPrInfo] = useState<PullRequestInfo | undefined>(undefined);

  const fetchPrInfo = useCallback(async () => {
    if (!branchName) {
      setPrInfo(undefined);
      return;
    }
    try {
      const { stdout } = await spawnAsync(
        'gh',
        ['pr', 'view', branchName, '--json', 'number,url'],
        { cwd }
      );
      const data = JSON.parse(stdout.toString().trim());
      if (data && typeof data.number === 'number') {
        setPrInfo({ number: data.number, url: data.url });
      } else {
        setPrInfo(undefined);
      }
    } catch (_error) {
      setPrInfo(undefined);
    }
  }, [cwd, branchName]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchPrInfo();
  }, [fetchPrInfo]);

  return prInfo;
}
