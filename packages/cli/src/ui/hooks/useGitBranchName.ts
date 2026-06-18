/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { spawnAsync, getAbsoluteGitDir } from '@google/gemini-cli-core';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

// How often to poll HEAD as a fallback when fs.watch delivers no events.
const HEAD_POLL_INTERVAL_MS = 2000;

export function useGitBranchName(cwd: string): string | undefined {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    void fetchBranchName(); // Initial fetch

    let watcher: fs.FSWatcher | undefined;
    let watchedHeadPath: string | undefined;
    let watchedHeadListener: ((curr: fs.Stats, prev: fs.Stats) => void) | undefined;
    let cancelled = false;

    const scheduleRefresh = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        void fetchBranchName();
      }, 100);
    };

    const setupWatcher = async () => {
      try {
        const gitDir = await getAbsoluteGitDir(cwd);
        if (!gitDir) return;

        // Ensure we can access the git dir
        await fsPromises.access(gitDir, fs.constants.F_OK);
        if (cancelled) return;

        const w = fs.watch(
          gitDir,
          (_eventType: string, filename: string | null) => {
            // Changes to HEAD indicate branch checkout or detached commit.
            // On some platforms filename may be null, so we refresh in that case too.
            if (!filename || filename === 'HEAD') {
              scheduleRefresh();
            }
          },
        );

        // fs.watch relies on the OS notification layer (inotify/FSEvents),
        // which delivers no events on some filesystems — most notably WSL
        // mounts of Windows drives and network shares. Poll HEAD with stat as
        // a reliable fallback so the branch still updates in those setups.
        const headPath = path.join(gitDir, 'HEAD');
        fs.watchFile(
          headPath,
          { interval: HEAD_POLL_INTERVAL_MS },
          (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs) {
              scheduleRefresh();
            }
          },
        );

        if (cancelled) {
          w.close();
          fs.unwatchFile(headPath);
        } else {
          watcher = w;
          watchedHeadPath = headPath;
        }
      } catch {
        // Silently ignore watcher errors (e.g. permissions or file not existing),
        // similar to how exec errors are handled.
        // The branch name will simply not update automatically.
      }
    };

    void setupWatcher();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      watcher?.close();
      if (watchedHeadPath) {
        fs.unwatchFile(watchedHeadPath);
      }
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
