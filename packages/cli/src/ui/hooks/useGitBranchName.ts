/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  spawnAsync,
  getAbsoluteGitDir,
  debugLogger,
} from '@google/gemini-cli-core';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

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
    let cancelled = false;

    const setupWatcher = async () => {
      try {
        const gitDir = await getAbsoluteGitDir(cwd);
        if (!gitDir) return;

        // Ensure we can access the git dir
        await fsPromises.access(gitDir, fs.constants.F_OK);
        if (cancelled) return;

        const w = fs.watch(
          gitDir,
          (eventType: string, filename: string | null) => {
            // Changes to HEAD indicate branch checkout or detached commit.
            // On some platforms filename may be null, so we refresh in that case too.
            if (!filename || filename === 'HEAD') {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }
              timeoutRef.current = setTimeout(() => {
                void fetchBranchName();
              }, 100);
            }
          },
        );

        // fs.watch reports some failures asynchronously through the watcher's
        // 'error' event instead of throwing, so the surrounding try/catch
        // cannot catch them. For example, under the macOS Seatbelt sandbox
        // FSEvents is unavailable and the watcher emits EMFILE. Without a
        // listener, Node turns that event into an uncaught exception that
        // crashes the CLI (https://github.com/google-gemini/gemini-cli/issues/28598).
        w.on('error', (error: Error) => {
          debugLogger.debug(
            'Git branch watcher failed; branch name will not update automatically:',
            error,
          );
          try {
            w.close();
          } catch {
            // Ignore close failures; this handler must never throw.
          }
        });

        if (cancelled) {
          w.close();
        } else {
          watcher = w;
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
    };
  }, [cwd, fetchBranchName]);

  return branchName;
}
