/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render as inkRender } from 'ink-testing-library';
import { Box } from 'ink';
import type React from 'react';
import { act } from 'react';
import { LoadedSettings, type Settings } from '../config/settings.js';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { ShellFocusContext } from '../ui/contexts/ShellFocusContext.js';
import { UIStateContext, type UIState } from '../ui/contexts/UIStateContext.js';
import { StreamingState } from '../ui/types.js';
import { ConfigContext } from '../ui/contexts/ConfigContext.js';
import { calculateMainAreaWidth } from '../ui/utils/ui-sizing.js';
import { VimModeProvider } from '../ui/contexts/VimModeContext.js';
import { MouseProvider } from '../ui/contexts/MouseContext.js';
import { ScrollProvider } from '../ui/contexts/ScrollProvider.js';

import { type Config } from '@google/gemini-cli-core';

// Wrapper around ink-testing-library's render that ensures act() is called
export const render = (
  tree: React.ReactElement,
  terminalWidth?: number,
): ReturnType<typeof inkRender> => {
  let renderResult: ReturnType<typeof inkRender> =
    undefined as unknown as ReturnType<typeof inkRender>;
  act(() => {
    renderResult = inkRender(tree);
  });

  if (terminalWidth !== undefined && renderResult?.stdout) {
    // Override the columns getter on the stdout instance provided by ink-testing-library
    Object.defineProperty(renderResult.stdout, 'columns', {
      get: () => terminalWidth,
      configurable: true,
    });

    // Trigger a rerender so Ink can pick up the new terminal width
    act(() => {
      renderResult.rerender(tree);
    });
  }

  const originalUnmount = renderResult.unmount;
  const originalRerender = renderResult.rerender;

  return {
    ...renderResult,
    unmount: () => {
      act(() => {
        originalUnmount();
      });
    },
    rerender: (newTree: React.ReactElement) => {
      act(() => {
        originalRerender(newTree);
      });
    },
  };
};

const mockConfig = {
  getModel: () => 'gemini-pro',
  getTargetDir: () =>
    '/Users/test/project/foo/bar/and/some/more/directories/to/make/it/long',
  getDebugMode: () => false,
};

const configProxy = new Proxy(mockConfig, {
  get(target, prop) {
    if (prop in target) {
      return target[prop as keyof typeof target];
    }
    throw new Error(`mockConfig does not have property ${String(prop)}`);
  },
});

export const mockSettings = new LoadedSettings(
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  true,
  new Set(),
);

export const createMockSettings = (
  overrides: Partial<Settings>,
): LoadedSettings => {
  const settings = overrides as Settings;
  return new LoadedSettings(
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings, originalSettings: settings },
    { path: '', settings: {}, originalSettings: {} },
    true,
    new Set(),
  );
};

// A minimal mock UIState to satisfy the context provider.
// Tests that need specific UIState values should provide their own.
const baseMockUiState = {
  renderMarkdown: true,
  streamingState: StreamingState.Idle,
  mainAreaWidth: 100,
  terminalWidth: 120,
  currentModel: 'gemini-pro',
};

export const renderWithProviders = (
  component: React.ReactElement,
  {
    shellFocus = true,
    settings = mockSettings,
    uiState: providedUiState,
    width,
    kittyProtocolEnabled = true,
    mouseEventsEnabled = false,
    config = configProxy as unknown as Config,
  }: {
    shellFocus?: boolean;
    settings?: LoadedSettings;
    uiState?: Partial<UIState>;
    width?: number;
    kittyProtocolEnabled?: boolean;
    mouseEventsEnabled?: boolean;
    config?: Config;
  } = {},
): ReturnType<typeof render> => {
  const baseState: UIState = new Proxy(
    { ...baseMockUiState, ...providedUiState },
    {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        // For properties not in the base mock or provided state,
        // we'll check the original proxy to see if it's a defined but
        // unprovided property, and if not, throw.
        if (prop in baseMockUiState) {
          return baseMockUiState[prop as keyof typeof baseMockUiState];
        }
        throw new Error(`mockUiState does not have property ${String(prop)}`);
      },
    },
  ) as UIState;

  const terminalWidth = width ?? baseState.terminalWidth;
  const mainAreaWidth = calculateMainAreaWidth(terminalWidth, settings);

  const finalUiState = {
    ...baseState,
    terminalWidth,
    mainAreaWidth,
  };

  return render(
    <ConfigContext.Provider value={config}>
      <SettingsContext.Provider value={settings}>
        <UIStateContext.Provider value={finalUiState}>
          <VimModeProvider settings={settings}>
            <ShellFocusContext.Provider value={shellFocus}>
              <KeypressProvider kittyProtocolEnabled={kittyProtocolEnabled}>
                <MouseProvider mouseEventsEnabled={mouseEventsEnabled}>
                  <ScrollProvider>
                    <Box
                      width={terminalWidth}
                      flexShrink={0}
                      flexGrow={0}
                      flexDirection="column"
                    >
                      {component}
                    </Box>
                  </ScrollProvider>
                </MouseProvider>
              </KeypressProvider>
            </ShellFocusContext.Provider>
          </VimModeProvider>
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
    terminalWidth,
  );
};

export function renderHook<Result, Props>(
  renderCallback: (props: Props) => Result,
  options?: {
    initialProps?: Props;
    wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  },
): {
  result: { current: Result };
  rerender: (props?: Props) => void;
  unmount: () => void;
} {
  const result = { current: undefined as unknown as Result };
  let currentProps = options?.initialProps as Props;

  function TestComponent({
    renderCallback,
    props,
  }: {
    renderCallback: (props: Props) => Result;
    props: Props;
  }) {
    result.current = renderCallback(props);
    return null;
  }

  const Wrapper = options?.wrapper || (({ children }) => <>{children}</>);

  let inkRerender: (tree: React.ReactElement) => void = () => {};
  let unmount: () => void = () => {};

  act(() => {
    const renderResult = render(
      <Wrapper>
        <TestComponent renderCallback={renderCallback} props={currentProps} />
      </Wrapper>,
    );
    inkRerender = renderResult.rerender;
    unmount = renderResult.unmount;
  });

  function rerender(props?: Props) {
    if (arguments.length > 0) {
      currentProps = props as Props;
    }
    act(() => {
      inkRerender(
        <Wrapper>
          <TestComponent renderCallback={renderCallback} props={currentProps} />
        </Wrapper>,
      );
    });
  }

  return { result, rerender, unmount };
}
