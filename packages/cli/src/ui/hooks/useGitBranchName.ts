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

// A hook that watches for changes in the Git repository's HEAD, handling
// repository initialization after the hook is active.
// @param cwd The current working directory.
// @param onBranchChange A callback to be invoked when a branch change is detected.
function useGitWatcher(cwd: string, onBranchChange: () => void) {
  // This effect implements a two-step strategy to watch for Git branch changes
  // in a way that is both efficient and handles the edge case of a Git
  // repository being initialized after the CLI has started.
  //
  // 1. Watch .git/HEAD directly: If the repository exists on startup,
  //    we watch the .git/HEAD file for changes. This is the most direct and
  //    efficient method, as this file is updated whenever the branch changes.
  //
  // 2. Watch for .git directory creation: If .git/HEAD doesn't exist at
  //    startup, we fall back to watching the current working directory (cwd)
  //    for the creation of the .git directory. This handles the case where the
  //    user runs `git init` after starting the CLI. Once the .git directory
  //    is detected, we switch to watching .git/HEAD as in step 1.
  useEffect(() => {
    onBranchChange(); // Initial fetch

    const gitHeadPath = path.join(cwd, '.git', 'HEAD');
    let headWatcher: fs.FSWatcher | undefined;
    let cwdWatcher: fs.FSWatcher | undefined;

    let isMounted = true;

    const setupHeadWatcher = () => {
      if (!isMounted) return;

      // Clean up existing watchers to prevent resource leaks.
      headWatcher?.close();
      // Stop watching the cwd for .git creation if we are now watching HEAD.
      cwdWatcher?.close();
      cwdWatcher = undefined;

      try {
        console.debug('[GitBranchName] Setting up HEAD watcher.');
        headWatcher = fs.watch(gitHeadPath, (eventType: string) => {
          if (eventType === 'rename') {
            // The file might have been deleted.
            void (async () => {
              try {
                await fsPromises.access(gitHeadPath, fs.constants.F_OK);
                // File still exists, so it was likely an atomic write.
                // Trigger a branch change check.
                if (isMounted) {
                  onBranchChange();
                }
              } catch {
                // File is gone. Fall back to watching the CWD.
                if (isMounted) {
                  console.debug(
                    '[GitBranchName] .git/HEAD deleted. Falling back to CWD watcher.',
                  );
                  // The headWatcher is now invalid, so close it before setting up the new one.
                  headWatcher?.close();
                  setupCwdWatcher();
                }
              }
            })();
          } else if (eventType === 'change') {
            // The file content changed.
            onBranchChange();
          }
        });
      } catch (e) {
        // Ignore errors, which can happen if the file is deleted.
        console.debug(
          '[GitBranchName] Error setting up HEAD watcher. Ignoring.',
          e,
        );
      }
    };

    const setupCwdWatcher = () => {
      if (!isMounted) return;

      try {
        console.debug(
          '[GitBranchName] .git/HEAD not found. Setting up CWD watcher.',
        );
        cwdWatcher = fs.watch(cwd, (eventType, filename) => {
          // On macOS, filename can be null for rename events.
          // To be robust, we check for the existence of the .git directory
          // if the filename is '.git' or if it's null.
          if (
            (eventType === 'rename' || eventType === 'change') &&
            (filename === '.git' || filename === null)
          ) {
            // Check if the created .git is actually a directory.
            fs.promises
              .stat(path.join(cwd, '.git'))
              .then((stats) => {
                if (!isMounted) return;

                if (stats.isDirectory()) {
                  console.debug(
                    '[GitBranchName] .git directory detected. Switching to HEAD watcher.',
                  );
                  // .git directory was created. Try to set up the HEAD watcher.
                  onBranchChange();
                  setupHeadWatcher();
                } else {
                  console.debug(
                    '[GitBranchName] .git was found, but it is not a directory. Ignoring.',
                  );
                }
              })
              .catch((err) => {
                // Ignore stat errors (e.g. file not found if the change was not .git creation)
                if (isMounted) {
                  console.debug(
                    '[GitBranchName] Error checking .git status. Ignoring.',
                    err,
                  );
                }
              });
          }
        });
      } catch (e) {
        // Ignore errors.
        console.debug(
          '[GitBranchName] Error setting up CWD watcher. Ignoring.',
          e,
        );
      }
    };

    void (async () => {
      try {
        await fsPromises.access(gitHeadPath, fs.constants.F_OK);
        if (isMounted) {
          // .git/HEAD exists, watch it directly.
          setupHeadWatcher();
        }
      } catch {
        if (isMounted) {
          // .git/HEAD does not exist, watch the cwd for .git creation.
          setupCwdWatcher();
        }
      }
    })();

    return () => {
      isMounted = false;
      console.debug('[GitBranchName] Closing watchers.');
      headWatcher?.close();
      cwdWatcher?.close();
    };
  }, [cwd, onBranchChange]);
}

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

  useGitWatcher(cwd, fetchBranchName);

  return branchName;
}
