/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { spawnAsync } from '@google/gemini-cli-core';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

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
    } catch {
      setBranchName(undefined);
    }
  }, [cwd, setBranchName]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchBranchName(); // Initial fetch

    let watcher: fs.FSWatcher | undefined;
    let cancelled = false;

    const setupWatcher = async () => {
      try {
        const { stdout } = await spawnAsync(
          'git',
          ['rev-parse', '--absolute-git-dir'],
          { cwd },
        );
        const gitDir = stdout.toString().trim();
        if (!gitDir) return;

        // Ensure we can access the git dir
        await fsPromises.access(gitDir, fs.constants.F_OK);
        if (cancelled) return;

        watcher = fs.watch(
          gitDir,
          (eventType: string, filename: string | null) => {
            // Changes to HEAD indicate branch checkout or detached commit
            if (filename === 'HEAD') {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              fetchBranchName();
            }
          },
        );
      } catch {
        // Silently ignore watcher errors (e.g. permissions or file not existing),
        // similar to how exec errors are handled.
        // The branch name will simply not update automatically.
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    setupWatcher();

    return () => {
      cancelled = true;
      watcher?.close();
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
