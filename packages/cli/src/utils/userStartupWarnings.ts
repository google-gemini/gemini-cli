/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  homedir,
  getCompatibilityWarnings,
  WarningPriority,
  type StartupWarning,
  isHeadlessMode,
  FatalUntrustedWorkspaceError,
} from '@google/gemini-cli-core';
import type { Settings } from '../config/settingsSchema.js';
import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
} from '../config/trustedFolders.js';

type WarningCheck = {
  id: string;
  check: (workspaceRoot: string, settings: Settings) => Promise<string | null>;
  priority: WarningPriority;
};

// Individual warning checks
const homeDirectoryCheck: WarningCheck = {
  id: 'home-directory',
  priority: WarningPriority.Low,
  check: async (workspaceRoot: string, settings: Settings) => {
    if (settings.ui?.showHomeDirectoryWarning === false) {
      return null;
    }

    try {
      const [workspaceRealPath, homeRealPath] = await Promise.all([
        fs.realpath(workspaceRoot),
        fs.realpath(homedir()),
      ]);

      if (workspaceRealPath === homeRealPath) {
        // If folder trust is enabled and the user trusts the home directory, don't show the warning.
        if (
          isFolderTrustEnabled(settings) &&
          isWorkspaceTrusted(settings).isTrusted
        ) {
          return null;
        }

        return 'Warning you are running Gemini CLI in your home directory.\nThis warning can be disabled in /settings';
      }
      return null;
    } catch {
      return 'Could not verify the current directory due to a file system error.';
    }
  },
};

const rootDirectoryCheck: WarningCheck = {
  id: 'root-directory',
  priority: WarningPriority.High,
  check: async (workspaceRoot: string, _settings: Settings) => {
    try {
      const workspaceRealPath = await fs.realpath(workspaceRoot);
      const errorMessage =
        'Warning: You are running Gemini CLI in the root directory. Your entire folder structure will be used for context. It is strongly recommended to run in a project-specific directory.';

      // Check for Unix root directory
      if (path.dirname(workspaceRealPath) === workspaceRealPath) {
        return errorMessage;
      }

      return null;
    } catch {
      return 'Could not verify the current directory due to a file system error.';
    }
  },
};

const folderTrustCheck: WarningCheck = {
  id: 'folder-trust',
  priority: WarningPriority.High,
  check: async (workspaceRoot: string, settings: Settings) => {
    if (!isFolderTrustEnabled(settings)) {
      return null;
    }

    const { isTrusted } = isWorkspaceTrusted(settings, workspaceRoot);
    if (isTrusted === true) {
      return null;
    }

    if (isHeadlessMode()) {
      throw new FatalUntrustedWorkspaceError(
        'Gemini CLI is not running in a trusted directory. To proceed, either use `--skip-trust`, ' +
          'set the `GEMINI_CLI_TRUST_WORKSPACE=true` environment variable, or trust this directory in interactive mode. ' +
          'For more details, see https://geminicli.com/docs/cli/trusted-folders/#headless-and-automated-environments',
      );
    }

    return null;
  },
};

// All warning checks
const WARNING_CHECKS: readonly WarningCheck[] = [
  homeDirectoryCheck,
  rootDirectoryCheck,
  folderTrustCheck,
];

export async function getUserStartupWarnings(
  settings: Settings,
  workspaceRoot: string = process.cwd(),
  options?: { isAlternateBuffer?: boolean },
): Promise<StartupWarning[]> {
  const results = await Promise.all(
    WARNING_CHECKS.map(async (check) => {
      const message = await check.check(workspaceRoot, settings);
      if (message) {
        return {
          id: check.id,
          message,
          priority: check.priority,
        };
      }
      return null;
    }),
  );
  const warnings = results.filter((w): w is StartupWarning => w !== null);

  if (settings.ui?.showCompatibilityWarnings !== false) {
    warnings.push(
      ...getCompatibilityWarnings({
        isAlternateBuffer: options?.isAlternateBuffer,
      }),
    );
  }

  return warnings;
}
