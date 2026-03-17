/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { basename } from 'node:path';
import { AppContainer } from './ui/AppContainer.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { registerCleanup, setupTtyCheck } from './utils/cleanup.js';
import {
  type StartupWarning,
  type Config,
  type ResumedSessionData,
  coreEvents,
  createWorkingStdio,
  disableMouseEvents,
  enableMouseEvents,
  disableLineWrapping,
  enableLineWrapping,
  shouldEnterAlternateScreen,
  recordSlowRender,
  writeToStdout,
  getVersion,
  debugLogger,
} from '@google/gemini-cli-core';
import type { InitializationResult } from './core/initializer.js';
import type { LoadedSettings } from './config/settings.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';
import { MouseProvider } from './ui/contexts/MouseContext.js';
import { StreamingState } from './ui/types.js';
import { computeTerminalTitle } from './utils/windowTitle.js';

import { SessionStatsProvider } from './ui/contexts/SessionContext.js';
import { VimModeProvider } from './ui/contexts/VimModeContext.js';
import { KeyMatchersProvider } from './ui/hooks/useKeyMatchers.js';
import { loadKeyMatchers } from './ui/key/keyMatchers.js';
import { KeypressProvider } from './ui/contexts/KeypressContext.js';
import { useKittyKeyboardProtocol } from './ui/hooks/useKittyKeyboardProtocol.js';
import { ScrollProvider } from './ui/contexts/ScrollProvider.js';
import { TerminalProvider } from './ui/contexts/TerminalContext.js';
import { isAlternateBufferEnabled } from './ui/hooks/useAlternateBuffer.js';
import { OverflowProvider } from './ui/contexts/OverflowContext.js';
import { profiler } from './ui/components/DebugProfiler.js';

const SLOW_RENDER_MS = 200;

export async function startInteractiveUI(
  config: Config,
  settings: LoadedSettings,
  startupWarnings: StartupWarning[],
  workspaceRoot: string = process.cwd(),
  resumedSessionData: ResumedSessionData | undefined,
  initializationResult: InitializationResult,
) {
  // Never enter Ink alternate buffer mode when screen reader mode is enabled
  // as there is no benefit of alternate buffer mode when using a screen reader
  // and the Ink alternate buffer mode requires line wrapping harmful to
  // screen readers.
  const useAlternateBuffer = shouldEnterAlternateScreen(
    isAlternateBufferEnabled(config),
    config.getScreenReader(),
  );
  const mouseEventsEnabled = useAlternateBuffer;
  if (mouseEventsEnabled) {
    enableMouseEvents();
    registerCleanup(() => {
      disableMouseEvents();
    });
  }

  const { matchers, errors } = await loadKeyMatchers();
  errors.forEach((error) => {
    coreEvents.emitFeedback('warning', error);
  });

  const version = await getVersion();
  setWindowTitle(basename(workspaceRoot), settings);

  const consolePatcher = new ConsolePatcher({
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

  const { stdout: inkStdout, stderr: inkStderr } = createWorkingStdio();

  const isShpool = !!process.env['SHPOOL_SESSION_NAME'];

  // Create wrapper component to use hooks inside render
  const AppWrapper = () => {
    useKittyKeyboardProtocol();

    return (
      <SettingsContext.Provider value={settings}>
        <KeyMatchersProvider value={matchers}>
          <KeypressProvider
            config={config}
            debugKeystrokeLogging={
              settings.merged.general.debugKeystrokeLogging
            }
          >
            <MouseProvider
              mouseEventsEnabled={mouseEventsEnabled}
              debugKeystrokeLogging={
                settings.merged.general.debugKeystrokeLogging
              }
            >
              <TerminalProvider>
                <ScrollProvider>
                  <OverflowProvider>
                    <SessionStatsProvider>
                      <VimModeProvider>
                        <AppContainer
                          config={config}
                          startupWarnings={startupWarnings}
                          version={version}
                          resumedSessionData={resumedSessionData}
                          initializationResult={initializationResult}
                        />
                      </VimModeProvider>
                    </SessionStatsProvider>
                  </OverflowProvider>
                </ScrollProvider>
              </TerminalProvider>
            </MouseProvider>
          </KeypressProvider>
        </KeyMatchersProvider>
      </SettingsContext.Provider>
    );
  };

  if (isShpool) {
    // Wait a moment for shpool to stabilize terminal size and state.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const instance = render(
    process.env['DEBUG'] ? (
      <React.StrictMode>
        <AppWrapper />
      </React.StrictMode>
    ) : (
      <AppWrapper />
    ),
    {
      stdout: inkStdout,
      stderr: inkStderr,
      stdin: process.stdin,
      exitOnCtrlC: false,
      isScreenReaderEnabled: config.getScreenReader(),
      onRender: ({ renderTime }: { renderTime: number }) => {
        if (renderTime > SLOW_RENDER_MS) {
          recordSlowRender(config, renderTime);
        }
        profiler.reportFrameRendered();
      },
      patchConsole: false,
      alternateBuffer: useAlternateBuffer,
      incrementalRendering:
        settings.merged.ui.incrementalRendering !== false &&
        useAlternateBuffer &&
        !isShpool,
    },
  );

  if (useAlternateBuffer) {
    disableLineWrapping();
    registerCleanup(() => {
      enableLineWrapping();
    });
  }

  checkForUpdates(settings)
    .then((info) => {
      handleAutoUpdate(info, settings, config.getProjectRoot());
    })
    .catch((err) => {
      // Silently ignore update check errors.
      if (config.getDebugMode()) {
        debugLogger.warn('Update check failed:', err);
      }
    });

  registerCleanup(() => instance.unmount());

  registerCleanup(setupTtyCheck());
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.ui.hideWindowTitle) {
    // Initial state before React loop starts
    const windowTitle = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      isSilentWorking: false,
      folderName: title,
      showThoughts: !!settings.merged.ui.showStatusInTitle,
      useDynamicTitle: settings.merged.ui.dynamicWindowTitle,
    });
    writeToStdout(`\x1b]0;${windowTitle}\x07`);

    process.on('exit', () => {
      writeToStdout(`\x1b]0;\x07`);
    });
  }
}
