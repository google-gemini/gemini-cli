/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
  type Config,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import * as settingsModule from '../../../config/settings.js';
import { act } from 'react';

// Hoist the listeners array so it can be accessed inside the mock factory
const { keypressListeners } = vi.hoisted(() => ({
  keypressListeners: [] as Array<(key: unknown) => void>,
}));

// Mock the settings module
vi.mock('../../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../config/settings.js')>();
  return {
    ...actual,
    addToAllowedTools: vi.fn(),
  };
});

// Mock useKeypress
vi.mock('../../hooks/useKeypress.js', async () => {
  const { useEffect } = await import('react');
  return {
    useKeypress: (
      callback: (key: unknown) => void,
      options: { isActive: boolean },
    ) => {
      useEffect(() => {
        if (options?.isActive !== false) {
          keypressListeners.push(callback);
        }
        return () => {
          const index = keypressListeners.indexOf(callback);
          if (index > -1) {
            keypressListeners.splice(index, 1);
          }
        };
      }, [callback, options?.isActive]);
    },
  };
});

function simulateKey(key: unknown) {
  act(() => {
    // Create a copy to avoid issues if listeners change during iteration
    [...keypressListeners].forEach((cb) => cb(key));
  });
}

describe('ToolConfirmationMessage Interaction', () => {
  beforeEach(() => {
    keypressListeners.length = 0;
    vi.clearAllMocks();
  });

  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;

  it('should call addToAllowedTools when "Yes, and add to allowed tools" is selected', async () => {
    const onConfirm = vi.fn();
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: 'diff',
      originalContent: 'old',
      newContent: 'new',
      isModifying: false,
      onConfirm,
    };

    renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    // Options:
    // 1. Yes, allow once
    // 2. Yes, allow always
    // 3. Yes, and add to allowed tools  <-- We want this (index 2)
    // 4. Modify with external editor
    // 5. No, suggest changes

    // Press down twice to reach index 2.

    // The key object structure mimics what Ink provides
    simulateKey({
      name: 'down',
      sequence: '\u001B[B',
      ctrl: false,
      meta: false,
      shift: false,
    });
    simulateKey({
      name: 'down',
      sequence: '\u001B[B',
      ctrl: false,
      meta: false,
      shift: false,
    });
    simulateKey({
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(settingsModule.addToAllowedTools).toHaveBeenCalledWith(
      expect.anything(), // loadedSettings
      'test.txt', // toolName for edit is fileName
    );

    // It should also confirm with ProceedOnce
    expect(onConfirm).toHaveBeenCalledWith(ToolConfirmationOutcome.ProceedOnce);
  });
});
