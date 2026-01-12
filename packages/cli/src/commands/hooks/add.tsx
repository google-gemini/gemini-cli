/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { render } from 'ink';
import { debugLogger } from '@google/gemini-cli-core';
import { loadSettings } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import { HookConfigurationWizard } from '../../ui/components/hooks/HookConfigurationWizard.js';
import { KeypressProvider } from '../../ui/contexts/KeypressContext.js';

async function handleAddHook(): Promise<void> {
  const workingDir = process.cwd();
  const settings = loadSettings(workingDir);

  const { unmount, waitUntilExit } = render(
    <KeypressProvider>
      <HookConfigurationWizard
        settings={settings}
        onComplete={(success, message) => {
          if (message) {
            if (success) {
              debugLogger.log(message);
              debugLogger.log(
                '\nNote: Set tools.enableHooks to true in your settings to enable the hook system.',
              );
            } else {
              debugLogger.log(message);
            }
          }
          unmount();
        }}
      />
    </KeypressProvider>,
  );

  await waitUntilExit();
}

export const addCommand: CommandModule = {
  command: 'add',
  describe: 'Add a new hook via interactive wizard',
  builder: (yargs) => yargs,
  handler: async () => {
    await handleAddHook();
    await exitCli();
  },
};
