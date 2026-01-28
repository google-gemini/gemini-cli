/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from '../test-utils/render.js';
import { act } from 'react';
import { IdeIntegrationNudge } from './IdeIntegrationNudge.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { debugLogger } from '@google/gemini-cli-core';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock debugLogger
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('IdeIntegrationNudge', () => {
  const defaultProps = {
    ide: {
      name: 'vscode',
      displayName: 'VS Code',
    },
    onComplete: vi.fn(),
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.mocked(debugLogger.warn).mockImplementation((...args) => {
      if (
        typeof args[0] === 'string' &&
        /was not wrapped in act/.test(args[0])
      ) {
        return;
      }
    });
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '');
  });

  it('renders correctly with default options', async () => {
    const { lastFrame } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} />
      </KeypressProvider>,
    );
    await act(async () => {
      await delay(100);
    });
    const frame = lastFrame();

    expect(frame).toContain('Do you want to connect VS Code to Gemini CLI?');
    expect(frame).toContain('Yes');
    expect(frame).toContain('No (esc)');
    expect(frame).toContain("No, don't ask again");
  });

  it('handles "Yes" selection', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} onComplete={onComplete} />
      </KeypressProvider>,
    );

    await act(async () => {
      await delay(100);
    });

    // "Yes" is the first option and selected by default usually.
    await act(async () => {
      stdin.write('\r');
      await delay(100);
    });

    expect(onComplete).toHaveBeenCalledWith({
      userSelection: 'yes',
      isExtensionPreInstalled: false,
    });
  });

  it('handles "No" selection', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} onComplete={onComplete} />
      </KeypressProvider>,
    );

    await act(async () => {
      await delay(100);
    });

    // Navigate down to "No (esc)"
    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
      await delay(100);
    });
    await act(async () => {
      stdin.write('\r'); // Enter
      await delay(100);
    });

    expect(onComplete).toHaveBeenCalledWith({
      userSelection: 'no',
      isExtensionPreInstalled: false,
    });
  });

  it('handles "Dismiss" selection', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} onComplete={onComplete} />
      </KeypressProvider>,
    );

    await act(async () => {
      await delay(100);
    });

    // Navigate down to "No, don't ask again"
    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
      await delay(100);
    });
    await act(async () => {
      stdin.write('\u001B[B'); // Down arrow
      await delay(100);
    });
    await act(async () => {
      stdin.write('\r'); // Enter
      await delay(100);
    });

    expect(onComplete).toHaveBeenCalledWith({
      userSelection: 'dismiss',
      isExtensionPreInstalled: false,
    });
  });

  it('handles Escape key press', async () => {
    const onComplete = vi.fn();
    const { stdin } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} onComplete={onComplete} />
      </KeypressProvider>,
    );

    await act(async () => {
      await delay(100);
    });

    // Press Escape
    await act(async () => {
      stdin.write('\u001B');
      await delay(100);
    });

    expect(onComplete).toHaveBeenCalledWith({
      userSelection: 'no',
      isExtensionPreInstalled: false,
    });
  });

  it('displays correct text and handles selection when extension is pre-installed', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '1234');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '/tmp');

    const onComplete = vi.fn();
    const { lastFrame, stdin } = render(
      <KeypressProvider>
        <IdeIntegrationNudge {...defaultProps} onComplete={onComplete} />
      </KeypressProvider>,
    );

    await act(async () => {
      await delay(100);
    });

    const frame = lastFrame();

    expect(frame).toContain(
      'If you select Yes, the CLI will have access to your open files',
    );
    expect(frame).not.toContain("we'll install an extension");

    // Select "Yes"
    await act(async () => {
      stdin.write('\r');
      await delay(100);
    });

    expect(onComplete).toHaveBeenCalledWith({
      userSelection: 'yes',
      isExtensionPreInstalled: true,
    });
  });
});
