/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, type Mock } from 'vitest';
import { type PartListUnion } from '@google/genai';
import type { SlashCommandProcessorResult } from '../types.js';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useEmbeddedShellExitConfirmation } from './useEmbeddedShellExitConfirmation.js';

describe('useEmbeddedShellExitConfirmation', () => {
  type MockHandleSlashCommand = Mock<
    (args: PartListUnion) => Promise<SlashCommandProcessorResult | false>
  >;
  const mockHandleSlashCommand: MockHandleSlashCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Initiate render should return default values', () => {
    const { result } = renderHook(() =>
      useEmbeddedShellExitConfirmation(mockHandleSlashCommand),
    );
    expect(result.current.embeddedShellExitConfirmationRequest).toBeNull();
    expect(result.current.isExitingEmbeddingShell).toBe(false);
  });

  it('Updates the embeddedShellExit state with a confirmation prompt when the user attempts to exit the embedded shell', () => {
    const { result } = renderHook(() =>
      useEmbeddedShellExitConfirmation(mockHandleSlashCommand),
    );

    act(() => {
      result.current.setIsExitingEmbeddingShell(true);
      result.current.setTriggerEmbeddedShellExit(true);
    });

    expect(result.current.embeddedShellExitConfirmationRequest).not.toBeNull();
    expect(result.current.embeddedShellExitConfirmationRequest).toHaveProperty(
      'prompt',
    );
    expect(result.current.embeddedShellExitConfirmationRequest).toHaveProperty(
      'onConfirm',
    );
  });

  it('Should call handleSlashCommand with /quit when confirmed', async () => {
    const { result } = renderHook(() =>
      useEmbeddedShellExitConfirmation(mockHandleSlashCommand),
    );

    act(() => {
      result.current.setIsExitingEmbeddingShell(true);
      result.current.setTriggerEmbeddedShellExit(true);
    });

    await act(async () => {
      result.current.embeddedShellExitConfirmationRequest!.onConfirm(true);
    });

    expect(mockHandleSlashCommand).toHaveBeenCalledTimes(1);
    expect(mockHandleSlashCommand).toHaveBeenCalledWith('/quit');
    expect(result.current.embeddedShellExitConfirmationRequest).toBeNull();
  });

  it('Should not call handleSlashCommand when confirmation is denied', async () => {
    const { result } = renderHook(() =>
      useEmbeddedShellExitConfirmation(mockHandleSlashCommand),
    );

    act(() => {
      result.current.setIsExitingEmbeddingShell(true);
      result.current.setTriggerEmbeddedShellExit(true);
    });

    await act(async () => {
      result.current.embeddedShellExitConfirmationRequest!.onConfirm(false);
    });

    expect(mockHandleSlashCommand).toHaveBeenCalledTimes(0);
    expect(mockHandleSlashCommand).not.toHaveBeenCalledWith('/quit');
    expect(result.current.embeddedShellExitConfirmationRequest).toBeNull();
  });
});
