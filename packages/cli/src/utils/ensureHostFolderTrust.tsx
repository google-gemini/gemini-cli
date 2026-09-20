/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink';
import { isHeadlessMode } from '@google/gemini-cli-core';
import {
  FolderTrustChoice,
  FolderTrustDialog,
} from '../ui/components/FolderTrustDialog.js';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
  TrustLevel,
} from '../config/trustedFolders.js';
import type { LoadedSettings } from '../config/settings.js';
import { persistHostTrust } from './sandboxTrust.js';

export async function ensureHostFolderTrust(
  settings: LoadedSettings,
  cwd: string,
): Promise<void> {
  if (!isFolderTrustEnabled(settings.merged)) {
    return;
  }
  if (isWorkspaceTrusted(settings.merged, cwd).isTrusted !== undefined) {
    return;
  }
  if (isHeadlessMode()) {
    return;
  }

  const choice = await new Promise<FolderTrustChoice>((resolve) => {
    const instance = render(
      <SettingsContext.Provider value={settings}>
        <KeypressProvider>
          <FolderTrustDialog
            onSelect={(selected) => {
              instance.unmount();
              resolve(selected);
            }}
            isRestarting={false}
            terminalHeight={process.stdout.rows ?? 24}
            terminalWidth={process.stdout.columns ?? 80}
            constrainHeight={true}
          />
        </KeypressProvider>
      </SettingsContext.Provider>,
    );
  });

  const level =
    choice === FolderTrustChoice.TRUST_FOLDER
      ? TrustLevel.TRUST_FOLDER
      : choice === FolderTrustChoice.TRUST_PARENT
        ? TrustLevel.TRUST_PARENT
        : TrustLevel.DO_NOT_TRUST;

  await persistHostTrust(cwd, level);
}
