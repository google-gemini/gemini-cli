/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ConfigExtensionDialog } from './ConfigExtensionDialog.js';
import {
  configureExtension,
  type ConfigLogger,
} from '../../commands/extensions/utils.js';
import type { ExtensionManager } from '../../config/extension-manager.js';
import { act } from 'react';
import { KeypressProvider } from '../contexts/KeypressContext.js';

// Mock the utils
vi.mock('../../commands/extensions/utils.js', () => ({
  configureExtension: vi.fn(),
  configureSpecificSetting: vi.fn(),
  configureAllExtensions: vi.fn(),
}));

describe('ConfigExtensionDialog', () => {
  const mockExtensionManager = {} as ExtensionManager;
  const mockLogger: ConfigLogger = {
    log: vi.fn(),
    error: vi.fn(),
  };
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display default value in prompt', async () => {
    // Setup mock to request a setting with default value
    (configureExtension as Mock).mockImplementation(
      async (
        _mgr,
        _name,
        _scope,
        _logger,
        requestSetting,
        _requestConfirmation,
      ) => {
        await requestSetting({
          name: 'testSetting',
          description: 'Test Description',
          envVar: 'TEST_VAR',
          defaultValue: 'default123',
        });
      },
    );

    const { lastFrame, unmount } = render(
      <KeypressProvider>
        <ConfigExtensionDialog
          extensionManager={mockExtensionManager}
          onClose={mockOnClose}
          extensionName="test-ext"
          loggerAdapter={mockLogger}
        />
      </KeypressProvider>,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Test Description');
      expect(lastFrame()).toContain('[default: default123]');
    });

    unmount();
  });

  it('should mask sensitive default value in prompt', async () => {
    (configureExtension as Mock).mockImplementation(
      async (
        _mgr,
        _name,
        _scope,
        _logger,
        requestSetting,
        _requestConfirmation,
      ) => {
        await requestSetting({
          name: 'sensitiveSetting',
          description: 'Sensitive Description',
          envVar: 'SENSITIVE_VAR',
          sensitive: true,
          defaultValue: 'secret123',
        });
      },
    );

    const { lastFrame, unmount } = render(
      <KeypressProvider>
        <ConfigExtensionDialog
          extensionManager={mockExtensionManager}
          onClose={mockOnClose}
          extensionName="test-ext"
          loggerAdapter={mockLogger}
        />
      </KeypressProvider>,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Sensitive Description');
      expect(lastFrame()).toContain('[default: ******]');
      expect(lastFrame()).not.toContain('secret123');
    });

    unmount();
  });

  it('should use default value when input is empty', async () => {
    let resolvedValue: string | undefined;

    (configureExtension as Mock).mockImplementation(
      async (
        _mgr,
        _name,
        _scope,
        _logger,
        requestSetting,
        _requestConfirmation,
      ) => {
        resolvedValue = await requestSetting({
          name: 'testSetting',
          description: 'Test Description',
          envVar: 'TEST_VAR',
          defaultValue: 'default123',
        });
      },
    );

    const { stdin, unmount, lastFrame } = render(
      <KeypressProvider>
        <ConfigExtensionDialog
          extensionManager={mockExtensionManager}
          onClose={mockOnClose}
          extensionName="test-ext"
          loggerAdapter={mockLogger}
        />
      </KeypressProvider>,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Test Description');
    });

    // Press Enter without typing anything
    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(resolvedValue).toBe('default123');
    });

    unmount();
  });

  it('should use input value even if default exists', async () => {
    let resolvedValue: string | undefined;

    (configureExtension as Mock).mockImplementation(
      async (
        _mgr,
        _name,
        _scope,
        _logger,
        requestSetting,
        _requestConfirmation,
      ) => {
        resolvedValue = await requestSetting({
          name: 'testSetting',
          description: 'Test Description',
          envVar: 'TEST_VAR',
          defaultValue: 'default123',
        });
      },
    );

    const { stdin, unmount, lastFrame } = render(
      <KeypressProvider>
        <ConfigExtensionDialog
          extensionManager={mockExtensionManager}
          onClose={mockOnClose}
          extensionName="test-ext"
          loggerAdapter={mockLogger}
        />
      </KeypressProvider>,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Test Description');
    });

    // Type 'custom' and Enter
    await act(async () => {
      for (const char of 'custom') {
        stdin.write(char);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(resolvedValue).toBe('custom');
    });

    unmount();
  });

  it('should work normally without default value', async () => {
    let resolvedValue: string | undefined;

    (configureExtension as Mock).mockImplementation(
      async (
        _mgr,
        _name,
        _scope,
        _logger,
        requestSetting,
        _requestConfirmation,
      ) => {
        resolvedValue = await requestSetting({
          name: 'testSetting',
          description: 'Test Description',
          envVar: 'TEST_VAR',
          // No defaultValue
        });
      },
    );

    const { stdin, unmount, lastFrame } = render(
      <KeypressProvider>
        <ConfigExtensionDialog
          extensionManager={mockExtensionManager}
          onClose={mockOnClose}
          extensionName="test-ext"
          loggerAdapter={mockLogger}
        />
      </KeypressProvider>,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Test Description');
      expect(lastFrame()).not.toContain('[default:');
    });

    // Type 'custom' and Enter
    await act(async () => {
      for (const char of 'custom') {
        stdin.write(char);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(resolvedValue).toBe('custom');
    });

    unmount();
  });
});
