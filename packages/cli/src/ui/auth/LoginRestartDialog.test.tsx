/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { LoginRestartDialog } from './LoginRestartDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import {
  RELAUNCH_EXIT_CODE,
  _resetRelaunchStateForTesting,
} from '../../utils/processUtils.js';
import { type Config } from '@google/gemini-cli-core';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedRunExitCleanup = runExitCleanup as Mock;

describe('LoginRestartDialog', () => {
  const onDismiss = vi.fn();
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);

  const mockConfig = {
    getRemoteAdminSettings: vi.fn(),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy.mockClear();
    vi.useRealTimers();
    _resetRelaunchStateForTesting();
  });

  it('renders correctly with default message', async () => {
    const { lastFrame, unmount } = await render(
      <LoginRestartDialog onDismiss={onDismiss} config={mockConfig} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with custom message', async () => {
    const { lastFrame, unmount } = await render(
      <LoginRestartDialog
        onDismiss={onDismiss}
        config={mockConfig}
        message="Authenticating to Vertex AI in Cloud Shell requires a restart to apply project settings."
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('calls onDismiss when escape is pressed', async () => {
    const { unmount } = await render(
      <LoginRestartDialog onDismiss={onDismiss} config={mockConfig} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'escape',
      shift: false,
      ctrl: false,
      cmd: false,
      sequence: '\u001b',
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    unmount();
  });

  it.each(['r', 'R'])(
    'calls runExitCleanup and process.exit when %s is pressed',
    async (keyName) => {
      vi.useFakeTimers();

      const { unmount } = await render(
        <LoginRestartDialog onDismiss={onDismiss} config={mockConfig} />,
      );
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];

      keypressHandler({
        name: keyName,
        shift: false,
        ctrl: false,
        cmd: false,
        sequence: keyName,
      });

      // Advance timers to trigger the setTimeout callback
      await vi.runAllTimersAsync();

      expect(mockedRunExitCleanup).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

      vi.useRealTimers();
      unmount();
    },
  );
});
