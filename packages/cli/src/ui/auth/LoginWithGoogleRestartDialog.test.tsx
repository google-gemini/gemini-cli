/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { LoginWithGoogleRestartDialog } from './LoginWithGoogleRestartDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { RELAUNCH_EXIT_CODE } from '../../utils/processUtils.js';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedRunExitCleanup = runExitCleanup as Mock;

describe('LoginWithGoogleRestartDialog', () => {
  const onDismiss = vi.fn();
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy.mockClear();
    vi.useRealTimers();
  });

  it('renders correctly', () => {
    const { lastFrame } = render(
      <LoginWithGoogleRestartDialog onDismiss={onDismiss} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onDismiss when escape is pressed', () => {
    render(<LoginWithGoogleRestartDialog onDismiss={onDismiss} />);
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'escape',
      sequence: '\u001b',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(['r', 'R'])(
    'calls runExitCleanup and process.exit when %s is pressed',
    async (keyName) => {
      vi.useFakeTimers();

      render(<LoginWithGoogleRestartDialog onDismiss={onDismiss} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];

      keypressHandler({
        name: keyName,
        sequence: keyName,
        ctrl: false,
        meta: false,
        shift: false,
      });

      // Advance timers to trigger the setTimeout callback
      await vi.runAllTimersAsync();

      expect(mockedRunExitCleanup).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

      vi.useRealTimers();
    },
  );
});
