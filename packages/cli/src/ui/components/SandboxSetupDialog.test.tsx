/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { SandboxSetupDialog } from './SandboxSetupDialog.js';
import { waitFor } from '../../test-utils/async.js';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    saveSettings: vi.fn(),
  };
});

// Simulate Docker installed + daemon running by default so save tests succeed.
// commandExists is mocked as an async function (the package's default export).
vi.mock('command-exists', () => ({
  default: Object.assign(vi.fn().mockResolvedValue(true), {
    sync: vi.fn(() => true),
  }),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn((): ChildProcess => {
      const emitter = new EventEmitter();
      Object.assign(emitter, { kill: vi.fn() });
      // Resolve asynchronously so React effects can process the result
      void Promise.resolve().then(() => emitter.emit('close', 0));
      return emitter as unknown as ChildProcess;
    }),
  };
});

// Import the mocked functions so we can assert on them
import { saveSettings } from '../../config/settings.js';
import { spawn } from 'node:child_process';
import commandExists from 'command-exists';

describe('SandboxSetupDialog', () => {
  const onExit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // vi.restoreAllMocks() in afterEach resets vi.fn() implementations to
    // empty, so re-establish the happy-path defaults before each test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(commandExists as any).mockResolvedValue(true);
    vi.mocked(spawn).mockImplementation((): ChildProcess => {
      const emitter = new EventEmitter();
      Object.assign(emitter, { kill: vi.fn() });
      void Promise.resolve().then(() => emitter.emit('close', 0));
      return emitter as unknown as ChildProcess;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeSettings(workspacePath = '/project/.gemini/settings.json') {
    return createMockSettings({
      workspace: {
        path: workspacePath,
        settings: {},
        originalSettings: {},
      },
    });
  }

  it('renders Step 1 — profile selection on mount', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('Sandbox Setup Wizard');
    expect(frame).toContain('Step 1 of 2');
    expect(frame).toContain('Web App');
    expect(frame).toContain('CLI Tool');
    expect(frame).toContain('API Service');
    expect(frame).toContain('Custom');
    unmount();
  });

  it('advances to Step 2 after selecting a profile with Enter', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    // Press Enter to select the default (first) profile
    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Step 2 of 2');
    });

    // Wait for the async runtime check to complete
    await waitFor(() => {
      expect(lastFrame()).toContain('Press Enter to continue');
    });

    const frame = lastFrame();
    expect(frame).toContain('Review and confirm');
    expect(frame).toContain('Profile:');
    expect(frame).toContain('Network access:');
    expect(frame).toContain('Allowed paths:');
    unmount();
  });

  it('shows "Checking sandbox runtime…" while the check is in progress', async () => {
    // Use a never-resolving spawn so the check stays in 'checking' state
    vi.mocked(spawn).mockImplementationOnce((): ChildProcess => {
      const emitter = new EventEmitter();
      Object.assign(emitter, { kill: vi.fn() });
      // Never emit 'close' — stays checking
      return emitter as unknown as ChildProcess;
    });

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Step 2 of 2');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('Checking sandbox runtime');
    });
    unmount();
  });

  it('Esc closes the dialog from Step 1 without saving', async () => {
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\x1b');
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledOnce();
    });
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  it('Esc closes the dialog from Step 2 without saving', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    // Advance to step 2
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('Step 2 of 2');
    });

    // Esc from step 2 (no need to wait for runtime check)
    await act(async () => {
      stdin.write('\x1b');
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledOnce();
    });
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  it('Enter on Step 2 advances to done screen with r/s choices', async () => {
    const settings = makeSettings();
    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={settings} />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));

    // Wait for runtime check to confirm ready
    await waitFor(() =>
      expect(lastFrame()).toContain('Press Enter to continue'),
    );

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('how would you like to enable sandbox');
    });

    const frame = lastFrame();
    expect(frame).toContain('This session only');
    expect(frame).toContain('Save permanently');
    // settings NOT saved yet
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  it('shows error on Step 2 when Docker daemon is not running', async () => {
    // Docker binary exists but daemon is not reachable
    vi.mocked(spawn).mockImplementationOnce((): ChildProcess => {
      const emitter = new EventEmitter();
      Object.assign(emitter, { kill: vi.fn() });
      void Promise.resolve().then(() => emitter.emit('close', 1));
      return emitter as unknown as ChildProcess;
    });

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));

    // Error appears automatically once the async check completes
    await waitFor(() => {
      expect(lastFrame()).toContain('daemon is not running');
    });
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  it('shows error on Step 2 when no runtime installed', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(commandExists as any).mockResolvedValue(false);

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));

    // Error appears automatically once the async check completes
    await waitFor(() => {
      expect(lastFrame()).toContain('not installed');
    });
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  it('pressing r on done screen sends session-env IPC and restarts (no settings saved)', async () => {
    const handleRestart = vi.fn();
    const processSend = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).send = processSend;

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
      { uiActions: { handleRestart } },
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));
    await waitFor(() =>
      expect(lastFrame()).toContain('Press Enter to continue'),
    );
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('how would you like'));

    await act(async () => {
      stdin.write('r');
    });

    await waitFor(() => {
      expect(handleRestart).toHaveBeenCalledOnce();
    });
    expect(processSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session-env-update' }),
    );
    expect(saveSettings).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (process as any).send;
    unmount();
  });

  it('pressing s on done screen saves to settings.json and restarts', async () => {
    const handleRestart = vi.fn();
    const settings = makeSettings();

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={settings} />,
      { uiActions: { handleRestart } },
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));
    await waitFor(() =>
      expect(lastFrame()).toContain('Press Enter to continue'),
    );
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('how would you like'));

    await act(async () => {
      stdin.write('s');
    });

    await waitFor(() => {
      expect(handleRestart).toHaveBeenCalledOnce();
    });
    expect(saveSettings).toHaveBeenCalledOnce();
    unmount();
  });

  it('Esc on done screen exits without saving or restarting', async () => {
    const handleRestart = vi.fn();

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={makeSettings()} />,
      { uiActions: { handleRestart } },
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));
    await waitFor(() =>
      expect(lastFrame()).toContain('Press Enter to continue'),
    );
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('how would you like'));

    await act(async () => {
      stdin.write('\x1b');
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledOnce();
    });
    expect(handleRestart).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    unmount();
  });

  describe('profile configs', () => {
    const profiles: Array<{
      arrowPresses: number;
      name: string;
      networkAccess: boolean;
    }> = [
      { arrowPresses: 0, name: 'WEB', networkAccess: true },
      { arrowPresses: 1, name: 'CLI', networkAccess: false },
      { arrowPresses: 2, name: 'API', networkAccess: true },
      { arrowPresses: 3, name: 'CUSTOM', networkAccess: false },
    ];

    for (const { arrowPresses, name, networkAccess } of profiles) {
      it(`${name} profile shows correct networkAccess=${networkAccess}`, async () => {
        const settings = makeSettings();
        const { lastFrame, stdin, waitUntilReady, unmount } =
          renderWithProviders(
            <SandboxSetupDialog onExit={onExit} settings={settings} />,
          );
        await waitUntilReady();

        // Navigate to desired profile
        for (let i = 0; i < arrowPresses; i++) {
          await act(async () => {
            stdin.write('\x1b[B'); // down arrow
          });
        }

        // Select profile
        await act(async () => {
          stdin.write('\r');
        });
        await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));

        const frame = lastFrame();
        expect(frame).toContain(`Profile:`);
        expect(frame).toContain(name);
        expect(frame).toContain(
          `Network access: ${networkAccess ? 'Yes' : 'No'}`,
        );
        expect(frame).toContain('none (strict isolation)');
        unmount();
      });
    }
  });

  it('writes sandbox config including command to workspace settings on save', async () => {
    const workspace = {
      path: '/project/.gemini/settings.json',
      settings: {},
      originalSettings: {},
    };
    const settings = createMockSettings({ workspace });
    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <SandboxSetupDialog onExit={onExit} settings={settings} />,
    );
    await waitUntilReady();

    // Select Web App (first item, networkAccess: true)
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('Step 2 of 2'));
    await waitFor(() =>
      expect(lastFrame()).toContain('Press Enter to continue'),
    );
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(lastFrame()).toContain('how would you like'));
    // Press 's' to save permanently
    await act(async () => {
      stdin.write('s');
    });

    expect(settings.workspace.settings.tools?.sandbox).toMatchObject({
      enabled: true,
      networkAccess: true,
      allowedPaths: [],
      command: 'docker',
    });
    // originalSettings is NOT mutated by the dialog
    expect(settings.workspace.originalSettings.tools?.sandbox).toBeUndefined();
    unmount();
  });
});
