/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import { ExitCodes } from '@google/gemini-cli-core';
import * as processUtils from '../../utils/processUtils.js';

vi.mock('../../utils/processUtils.js', () => ({
  relaunchApp: vi.fn(),
}));

const mockedExit = vi.hoisted(() => vi.fn());
const mockedCwd = vi.hoisted(() => vi.fn());
const mockedRows = vi.hoisted(() => ({ current: 24 }));

vi.mock('node:process', async () => {
  const actual =
    await vi.importActual<typeof import('node:process')>('node:process');
  return {
    ...actual,
    exit: mockedExit,
    cwd: mockedCwd,
  };
});

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, terminalHeight: mockedRows.current }),
}));

describe('FolderTrustDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockedCwd.mockReturnValue('/home/user/project');
    mockedRows.current = 24;
  });

  it('should render the dialog with title and description', () => {
    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Do you trust the files in this folder?');
    expect(lastFrame()).toContain(
      'Trusting a folder allows Gemini CLI to load its local configurations',
    );
    unmount();
  });

  it('should truncate discovery results when they exceed maxDiscoveryHeight', () => {
    // maxDiscoveryHeight = 24 - 15 = 9.
    const discoveryResults = {
      commands: Array.from({ length: 10 }, (_, i) => `cmd${i}`),
      mcps: Array.from({ length: 10 }, (_, i) => `mcp${i}`),
      hooks: Array.from({ length: 10 }, (_, i) => `hook${i}`),
      skills: Array.from({ length: 10 }, (_, i) => `skill${i}`),
      settings: Array.from({ length: 10 }, (_, i) => `setting${i}`),
      discoveryErrors: [],
      securityWarnings: [],
    };
    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        discoveryResults={discoveryResults}
      />,
      {
        width: 80,
        useAlternateBuffer: false,
        uiState: { constrainHeight: true, terminalHeight: 24 },
      },
    );

    expect(lastFrame()).toContain('This folder contains:');
    expect(lastFrame()).toContain('hidden');
    unmount();
  });

  it('should adjust maxHeight based on terminal rows', () => {
    mockedRows.current = 14; // maxHeight = 14 - 10 = 4
    const discoveryResults = {
      commands: ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'],
      mcps: [],
      hooks: [],
      skills: [],
      settings: [],
      discoveryErrors: [],
      securityWarnings: [],
    };
    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        discoveryResults={discoveryResults}
      />,
      {
        width: 80,
        useAlternateBuffer: false,
        uiState: { constrainHeight: true, terminalHeight: 14 },
      },
    );

    // With maxHeight=4, the intro text (4 lines) will take most of the space.
    // The discovery results will likely be hidden.
    expect(lastFrame()).toContain('hidden');
    unmount();
  });

  it('should use minimum maxHeight of 4', () => {
    mockedRows.current = 8; // 8 - 10 = -2, should use 4
    const discoveryResults = {
      commands: ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'],
      mcps: [],
      hooks: [],
      skills: [],
      settings: [],
      discoveryErrors: [],
      securityWarnings: [],
    };
    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        discoveryResults={discoveryResults}
      />,
      {
        width: 80,
        useAlternateBuffer: false,
        uiState: { constrainHeight: true, terminalHeight: 10 },
      },
    );

    expect(lastFrame()).toContain('hidden');
    unmount();
  });

  it('should toggle expansion when global Ctrl+O is handled', async () => {
    const discoveryResults = {
      commands: Array.from({ length: 10 }, (_, i) => `cmd${i}`),
      mcps: [],
      hooks: [],
      skills: [],
      settings: [],
      discoveryErrors: [],
      securityWarnings: [],
    };

    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        discoveryResults={discoveryResults}
      />,
      {
        width: 80,
        useAlternateBuffer: false,
        // Initially constrained
        uiState: { constrainHeight: true, terminalHeight: 24 },
      },
    );

    // Initial state: truncated
    await waitFor(() => {
      expect(lastFrame()).toContain('Do you trust the files in this folder?');
      expect(lastFrame()).toContain('Press ctrl-o to show more lines');
      expect(lastFrame()).toContain('hidden');
    });

    // We can't easily simulate global Ctrl+O toggle in this unit test
    // because it's handled in AppContainer.
    // But we can re-render with constrainHeight: false.
    const { lastFrame: lastFrameExpanded, unmount: unmountExpanded } =
      renderWithProviders(
        <FolderTrustDialog
          onSelect={vi.fn()}
          discoveryResults={discoveryResults}
        />,
        {
          width: 80,
          useAlternateBuffer: false,
          uiState: { constrainHeight: false, terminalHeight: 24 },
        },
      );

    await waitFor(() => {
      expect(lastFrameExpanded()).not.toContain('hidden');
      expect(lastFrameExpanded()).toContain('- cmd9');
      expect(lastFrameExpanded()).toContain('- cmd4');
    });

    unmount();
    unmountExpanded();
  });

  it('should display exit message and call process.exit and not call onSelect when escape is pressed', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin, unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={onSelect} isRestarting={false} />,
    );

    act(() => {
      stdin.write('\u001b[27u'); // Press kitty escape key
    });

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'A folder trust level must be selected to continue. Exiting since escape was pressed.',
      );
    });
    await waitFor(() => {
      expect(mockedExit).toHaveBeenCalledWith(
        ExitCodes.FATAL_CANCELLATION_ERROR,
      );
    });
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it('should display restart message when isRestarting is true', () => {
    const { lastFrame, unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    expect(lastFrame()).toContain('Gemini CLI is restarting');
    unmount();
  });

  it('should call relaunchApp when isRestarting is true', async () => {
    vi.useFakeTimers();
    const relaunchApp = vi.spyOn(processUtils, 'relaunchApp');
    const { unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(relaunchApp).toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  it('should not call relaunchApp if unmounted before timeout', async () => {
    vi.useFakeTimers();
    const relaunchApp = vi.spyOn(processUtils, 'relaunchApp');
    const { unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    // Unmount immediately (before 250ms)
    unmount();

    await vi.advanceTimersByTimeAsync(250);
    expect(relaunchApp).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should not call process.exit when "r" is pressed and isRestarting is false', async () => {
    const { stdin, unmount } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={false} />,
    );

    act(() => {
      stdin.write('r');
    });

    await waitFor(() => {
      expect(mockedExit).not.toHaveBeenCalled();
    });
    unmount();
  });

  describe('directory display', () => {
    it('should correctly display the folder name for a nested directory', () => {
      mockedCwd.mockReturnValue('/home/user/project');
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust folder (project)');
      unmount();
    });

    it('should correctly display the parent folder name for a nested directory', () => {
      mockedCwd.mockReturnValue('/home/user/project');
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust parent folder (user)');
      unmount();
    });

    it('should correctly display an empty parent folder name for a directory directly under root', () => {
      mockedCwd.mockReturnValue('/project');
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust parent folder ()');
      unmount();
    });

    it('should display discovery results when provided', () => {
      mockedRows.current = 40; // Increase height to show all results
      const discoveryResults = {
        commands: ['cmd1', 'cmd2'],
        mcps: ['mcp1'],
        hooks: ['hook1'],
        skills: ['skill1'],
        settings: ['general', 'ui'],
        discoveryErrors: [],
        securityWarnings: [],
      };
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog
          onSelect={vi.fn()}
          discoveryResults={discoveryResults}
        />,
        { width: 80 },
      );

      expect(lastFrame()).toContain('This folder contains:');
      expect(lastFrame()).toContain('• Commands (2):');
      expect(lastFrame()).toContain('- cmd1');
      expect(lastFrame()).toContain('- cmd2');
      expect(lastFrame()).toContain('• MCP Servers (1):');
      expect(lastFrame()).toContain('- mcp1');
      expect(lastFrame()).toContain('• Hooks (1):');
      expect(lastFrame()).toContain('- hook1');
      expect(lastFrame()).toContain('• Skills (1):');
      expect(lastFrame()).toContain('- skill1');
      expect(lastFrame()).toContain('• Setting overrides (2):');
      expect(lastFrame()).toContain('- general');
      expect(lastFrame()).toContain('- ui');
      unmount();
    });

    it('should display security warnings when provided', () => {
      const discoveryResults = {
        commands: [],
        mcps: [],
        hooks: [],
        skills: [],
        settings: [],
        discoveryErrors: [],
        securityWarnings: ['Dangerous setting detected!'],
      };
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog
          onSelect={vi.fn()}
          discoveryResults={discoveryResults}
        />,
      );

      expect(lastFrame()).toContain('Security Warnings:');
      expect(lastFrame()).toContain('Dangerous setting detected!');
      unmount();
    });

    it('should display discovery errors when provided', () => {
      const discoveryResults = {
        commands: [],
        mcps: [],
        hooks: [],
        skills: [],
        settings: [],
        discoveryErrors: ['Failed to load custom commands'],
        securityWarnings: [],
      };
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog
          onSelect={vi.fn()}
          discoveryResults={discoveryResults}
        />,
      );

      expect(lastFrame()).toContain('Discovery Errors:');
      expect(lastFrame()).toContain('Failed to load custom commands');
      unmount();
    });

    it('should use scrolling instead of truncation when alternate buffer is enabled and expanded', () => {
      const discoveryResults = {
        commands: Array.from({ length: 20 }, (_, i) => `cmd${i}`),
        mcps: [],
        hooks: [],
        skills: [],
        settings: [],
        discoveryErrors: [],
        securityWarnings: [],
      };
      const { lastFrame, unmount } = renderWithProviders(
        <FolderTrustDialog
          onSelect={vi.fn()}
          discoveryResults={discoveryResults}
        />,
        {
          width: 80,
          useAlternateBuffer: true,
          uiState: { constrainHeight: false, terminalHeight: 15 },
        },
      );

      // In alternate buffer + expanded, the title should be visible (StickyHeader)
      expect(lastFrame()).toContain('Do you trust the files in this folder?');
      // And it should NOT use MaxSizedBox truncation
      expect(lastFrame()).not.toContain('hidden');
      unmount();
    });
  });
});
