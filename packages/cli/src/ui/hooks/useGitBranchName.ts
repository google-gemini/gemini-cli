/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync } from '@google/gemini-cli-core';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

export function useGitBranchName(cwd: string): string | undefined {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);

  const fetchBranchName = useCallback(async () => {
    try {
      const { stdout } = await spawnAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd },
      );
      const branch = stdout.toString().trim();
      if (branch && branch !== 'HEAD') {
        setBranchName(branch);
      } else {
        const { stdout: hashStdout } = await spawnAsync(
          'git',
          ['rev-parse', '--short', 'HEAD'],
          { cwd },
        );
        setBranchName(hashStdout.toString().trim());
      }
    } catch (_error) {
      setBranchName(undefined);
    }
  }, [cwd, setBranchName]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchBranchName(); // Initial fetch

    const gitHeadPath = path.join(cwd, '.git', 'HEAD');
    const gitLogsHeadPath = path.join(cwd, '.git', 'logs', 'HEAD');
    const watchers: fs.FSWatcher[] = [];
    let cancelled = false;

    const onFileChange = (eventType: string) => {
      if (eventType === 'change' || eventType === 'rename') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchBranchName();
      }
    };

    const watchFile = async (filePath: string) => {
      try {
        await fsPromises.access(filePath, fs.constants.F_OK);
        if (cancelled) return;
        const watcher = fs.watch(filePath, onFileChange);
        watchers.push(watcher);
      } catch {
        // Silently ignore if the file doesn't exist or can't be watched.
      }
    };

    const setupWatchers = async () => {
      // Watch .git/HEAD — the canonical source for the current branch ref.
      // This file is always updated on branch switches (git checkout, git switch).
      await watchFile(gitHeadPath);
      // Also watch .git/logs/HEAD for reflog-based updates, which covers
      // additional operations like commits and resets.
      await watchFile(gitLogsHeadPath);
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    setupWatchers();

    return () => {
      cancelled = true;
      for (const watcher of watchers) {
        watcher.close();
      }
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
