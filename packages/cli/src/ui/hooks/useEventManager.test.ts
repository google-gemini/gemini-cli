/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import type { LoadedSettings } from '../../config/settings.js';
import { useEvents, Event } from './useEventManager.js';

const spawnMock = vi.fn();
const onMock = vi.fn();

vi.mock('node:child_process', () => ({
  default: {
    spawn: (...args: unknown[]) => {
      spawnMock(...args);
      return {
        on: onMock,
      };
    },
  },
}));

describe('useEvents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should do nothing if events are not configured', () => {
    const settings = { merged: {} } as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));

    result.current.notify(Event.Confirm);

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('should do nothing if the event is not configured to be handled', () => {
    const settings = {
      merged: {
        events: [{ on: [Event.Idle], spawn: ['echo', 'hello'] }],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));

    result.current.notify(Event.Confirm);

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('should spawn a process when the event is configured', () => {
    const settings = {
      merged: {
        events: [{ on: [Event.Confirm], spawn: ['echo', 'hello'] }],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));

    result.current.notify(Event.Confirm);

    expect(spawnMock).toHaveBeenCalledWith('echo', ['hello'], {
      stdio: 'inherit',
    });
  });

  it('should handle spawn errors', () => {
    const settings = {
      merged: {
        events: [{ on: [Event.Confirm], spawn: ['echo', 'hello'] }],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));
    const consoleErrorMock = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    onMock.mockImplementation((event, callback) => {
      if (event === 'error') {
        callback(new Error('spawn error'));
      }
    });

    result.current.notify(Event.Confirm);

    expect(spawnMock).toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Failed to spawn process:',
      new Error('spawn error'),
    );
  });

  it('should not spawn a process if spawn is not configured', () => {
    const settings = {
      merged: {
        events: [{ on: [Event.Confirm] }],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));
    const consoleErrorMock = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    result.current.notify(Event.Confirm);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'No command configured to handle event',
      'confirm',
    );
  });

  it('should not spawn a process if spawn is empty', () => {
    const settings = {
      merged: {
        events: [{ on: [Event.Confirm], spawn: [] }],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));
    const consoleErrorMock = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    result.current.notify(Event.Confirm);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'No command configured to handle event',
      'confirm',
    );
  });

  it('should handle multiple event handlers', () => {
    const settings = {
      merged: {
        events: [
          { on: [Event.Confirm], spawn: ['echo', 'hello'] },
          { on: [Event.Confirm], spawn: ['npm', 'test'] },
        ],
      },
    } as unknown as LoadedSettings;
    const { result } = renderHook(() => useEvents(settings));

    result.current.notify(Event.Confirm);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).toHaveBeenCalledWith('echo', ['hello'], {
      stdio: 'inherit',
    });
    expect(spawnMock).toHaveBeenCalledWith('npm', ['test'], {
      stdio: 'inherit',
    });
  });
});
