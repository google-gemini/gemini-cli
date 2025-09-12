/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  type Extension,
  getWorkspaceExtensions,
} from '../../config/extension.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';
import process from 'node:process';

export function useWorkspaceMigration(settings: LoadedSettings) {
  const [showWorkspaceMigrationDialog, setShowWorkspaceMigrationDialog] =
    useState(false);
  const [workspaceExtensions, setWorkspaceExtensions] = useState<Extension[]>(
    [],
  );

  useEffect(() => {
    // Default to true if not set.
    if (!(settings.merged.experimental?.extensionManagement ?? true)) {
      return;
    }
    const cwd = process.cwd();
    const extensions = getWorkspaceExtensions(cwd);
    if (
      extensions.length > 0 &&
      !settings.merged.extensions?.workspacesWithMigrationNudge?.includes(cwd)
    ) {
      setWorkspaceExtensions(extensions);
      setShowWorkspaceMigrationDialog(true);
      console.log(settings.merged.extensions);
    }
  }, [
    settings.merged.extensions,
    settings.merged.experimental?.extensionManagement,
  ]);

  const onWorkspaceMigrationDialogOpen = () => {
    const userSettings = settings.forScope(SettingScope.User);
    const extensionSettings = userSettings.settings.extensions || {
      disabled: [],
    };
    const workspacesWithMigrationNudge =
      extensionSettings.workspacesWithMigrationNudge || [];

    const cwd = process.cwd();
    if (!workspacesWithMigrationNudge.includes(cwd)) {
      workspacesWithMigrationNudge.push(cwd);
    }

    extensionSettings.workspacesWithMigrationNudge =
      workspacesWithMigrationNudge;
    settings.setValue(SettingScope.User, 'extensions', extensionSettings);
  };

  const onWorkspaceMigrationDialogClose = () => {
    setShowWorkspaceMigrationDialog(false);
  };

  return {
    showWorkspaceMigrationDialog,
    workspaceExtensions,
    onWorkspaceMigrationDialogOpen,
    onWorkspaceMigrationDialogClose,
  };
}
