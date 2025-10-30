/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { Config } from '@google/gemini-cli-core';
import { loadTrustedFolders } from '../../config/trustedFolders.js';
import {
  expandHomeDir,
  finishAddingDirectories,
} from '../commands/directoryUtils.js';
import { MultiFolderTrustDialog } from '../components/MultiFolderTrustDialog.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

export function useIncludeDirsTrust(
  config: Config,
  settings: LoadedSettings,
  isFolderTrustDialogOpen: boolean,
  isTrustedFolder: boolean | undefined,
  historyManager: UseHistoryManagerReturn,
  setCustomDialog: (dialog: React.ReactNode | null) => void,
  setGeminiMdFileCount: (count: number) => void,
) {
  const [includeDirsTrustChecked, setIncludeDirsTrustChecked] = useState(false);
  const { addItem } = historyManager;

  useEffect(() => {
    // Don't run this until the initial trust is determined or if it has already run.
    if (isTrustedFolder === undefined || includeDirsTrustChecked || !config) {
      return;
    }

    // Mark as checked regardless of the outcome to prevent re-running.
    setIncludeDirsTrustChecked(true);

    const pendingDirs = config.getPendingIncludeDirectories();
    if (pendingDirs.length === 0) {
      return;
    }

    console.log('Inside useIncludeDirsTrust');

    // If folder trust is disabled, isTrustedFolder will be undefined.
    // In that case, we can just add the directories without checking them.
    if (config.getFolderTrust() === false) {
      const added: string[] = [];
      const errors: string[] = [];
      const workspaceContext = config.getWorkspaceContext();
      for (const pathToAdd of pendingDirs) {
        try {
          workspaceContext.addDirectory(expandHomeDir(pathToAdd.trim()));
          added.push(pathToAdd.trim());
        } catch (e) {
          const error = e as Error;
          errors.push(`Error adding '${pathToAdd.trim()}': ${error.message}`);
        }
      }

      if (added.length > 0 || errors.length > 0) {
        finishAddingDirectories(
          config,
          settings,
          addItem,
          setGeminiMdFileCount,
          added,
          errors,
          true, // silentOnSuccess
        );
      }
      config.clearPendingIncludeDirectories();
      return;
    }

    // If the user decided not to trust the main folder, don't proceed.
    if (isTrustedFolder === false) {
      const added: string[] = [];
      const errors: string[] = [];
      const workspaceContext = config.getWorkspaceContext();
      for (const pathToAdd of pendingDirs) {
        try {
          workspaceContext.addDirectory(expandHomeDir(pathToAdd.trim()));
          added.push(pathToAdd.trim());
        } catch (e) {
          const error = e as Error;
          errors.push(`Error adding '${pathToAdd.trim()}': ${error.message}`);
        }
      }

      if (added.length > 0 || errors.length > 0) {
        finishAddingDirectories(
          config,
          settings,
          addItem,
          setGeminiMdFileCount,
          added,
          errors,
          true, // silentOnSuccess
        );
      }
      config.clearPendingIncludeDirectories();
      return;
    }

    const trustedFolders = loadTrustedFolders();
    const untrustedDirs: string[] = [];
    const undefinedTrustDirs: string[] = [];
    const trustedDirs: string[] = [];
    const added: string[] = [];
    const errors: string[] = [];

    for (const pathToAdd of pendingDirs) {
      const expandedPath = expandHomeDir(pathToAdd.trim());
      const isTrusted = trustedFolders.isPathTrusted(expandedPath);
      if (isTrusted === false) {
        untrustedDirs.push(pathToAdd.trim());
      } else if (isTrusted === undefined) {
        undefinedTrustDirs.push(pathToAdd.trim());
      } else {
        trustedDirs.push(pathToAdd.trim());
      }
    }

    if (untrustedDirs.length > 0) {
      errors.push(
        `The following directories are explicitly untrusted and cannot be added to a trusted workspace:\n- ${untrustedDirs.join(
          '\n- ',
        )}\nPlease use the permissions command to modify their trust level.`,
      );
    }

    const workspaceContext = config.getWorkspaceContext();
    for (const pathToAdd of trustedDirs) {
      try {
        workspaceContext.addDirectory(expandHomeDir(pathToAdd));
        added.push(pathToAdd);
      } catch (e) {
        const error = e as Error;
        errors.push(`Error adding '${pathToAdd}': ${error.message}`);
      }
    }

    if (undefinedTrustDirs.length > 0) {
      setCustomDialog(
        <MultiFolderTrustDialog
          folders={undefinedTrustDirs}
          onComplete={() => {
            setCustomDialog(null);
            config.clearPendingIncludeDirectories();
          }}
          trustedDirs={added}
          errors={errors}
          finishAddingDirectories={finishAddingDirectories}
          config={config}
          settings={settings}
          addItem={addItem}
          setGeminiMdFileCount={setGeminiMdFileCount}
          silentOnSuccess={true}
        />,
      );
    } else if (added.length > 0 || errors.length > 0) {
      finishAddingDirectories(
        config,
        settings,
        addItem,
        setGeminiMdFileCount,
        added,
        errors,
        true,
      );
      config.clearPendingIncludeDirectories();
    }
  }, [
    isTrustedFolder,
    includeDirsTrustChecked,
    config,
    settings,
    addItem,
    setGeminiMdFileCount,
    setCustomDialog,
  ]);
}
