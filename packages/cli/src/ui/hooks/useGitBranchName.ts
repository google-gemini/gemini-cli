/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'path';

export function useGitBranchName(cwd: string): string | undefined {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);
  const requestCounterRef = useRef(0);

  const fetchBranchName = useCallback(() => {
    const currentRequestId = ++requestCounterRef.current;

    exec(
      'git rev-parse --abbrev-ref HEAD',
      { cwd },
      (error, stdout, _stderr) => {
        // Ignore stale responses
        if (currentRequestId !== requestCounterRef.current) {
          return;
        }

        if (error) {
          setBranchName(undefined);
          return;
        }
        const branch = stdout.toString().trim();
        if (branch && branch !== 'HEAD') {
          setBranchName(branch);
        } else {
          exec(
            'git rev-parse --short HEAD',
            { cwd },
            (error, stdout, _stderr) => {
              // Ignore stale responses for the second exec call too
              if (currentRequestId !== requestCounterRef.current) {
                return;
              }

              if (error) {
                setBranchName(undefined);
                return;
              }
              setBranchName(stdout.toString().trim());
            },
          );
        }
      },
    );
  }, [cwd]);

  useEffect(() => {
    fetchBranchName(); // Initial fetch

    const gitLogsHeadPath = path.join(cwd, '.git', 'logs', 'HEAD');
    let watcher: fs.FSWatcher | undefined;
    let isCancelled = false;

    const setupWatcher = async () => {
      try {
        // Check if .git/logs/HEAD exists, as it might not in a new repo or orphaned head
        await fsPromises.access(gitLogsHeadPath, fs.constants.F_OK);

        // Check if the component has been unmounted while we were awaiting
        if (isCancelled) {
          return;
        }

        watcher = fs.watch(gitLogsHeadPath, (eventType: string) => {
          // Changes to .git/logs/HEAD (appends) indicate HEAD has likely changed
          if (eventType === 'change' || eventType === 'rename') {
            // Handle rename just in case
            fetchBranchName();
          }
        });
      } catch (_watchError) {
        // Silently ignore watcher errors (e.g. permissions or file not existing),
        // similar to how exec errors are handled.
        // The branch name will simply not update automatically.
      }
    };

    setupWatcher();

    return () => {
      isCancelled = true;
      watcher?.close();
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
