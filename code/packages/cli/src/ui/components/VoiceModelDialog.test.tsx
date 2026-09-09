/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { VoiceModelDialog } from './VoiceModelDialog.js';
import { act } from 'react';
import { waitFor } from '../../test-utils/async.js';
import { SettingScope } from '../../config/settings.js';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    isBinaryAvailable: vi.fn().mockReturnValue(true),
    WhisperModelManager: vi.fn().mockImplementation(() => ({
      isModelInstalled: vi.fn().mockReturnValue(false),
      on: vi.fn(),
      off: vi.fn(),
      downloadModel: vi.fn(),
    })),
  };
});

describe('VoiceModelDialog', () => {
  it('should display a privacy warning when Gemini Live API (Cloud) is selected', async () => {
    const onClose = vi.fn();
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <VoiceModelDialog onClose={onClose} />,
    );

    await waitUntilReady();

    const frame = lastFrame();
    expect(frame).toContain('Gemini Live API (Cloud)');
    expect(frame).toContain('When using the Gemini Live backend');
  });

  it('should NOT display a privacy warning when Whisper (Local) is highlighted', async () => {
    const onClose = vi.fn();
    const { lastFrame, waitUntilReady, stdin } = await renderWithProviders(
      <VoiceModelDialog onClose={onClose} />,
    );

    await waitUntilReady();

    // Verify warning is present for default (Gemini Live)
    expect(lastFrame()).toContain('When using the Gemini Live backend');

    // Arrow Down to highlight Whisper
    await act(async () => {
      stdin.write('\u001b[B');
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Whisper (Local)');
      expect(frame).not.toContain('When using the Gemini Live backend');
    });
  });

  it('should update settings and close dialog when a backend is selected', async () => {
    const onClose = vi.fn();
    const settings = createMockSettings();
    const setValueSpy = vi.spyOn(settings, 'setValue');

    const { waitUntilReady, stdin } = await renderWithProviders(
      <VoiceModelDialog onClose={onClose} />,
      { settings },
    );

    await waitUntilReady();

    // Select Gemini Live (it's already highlighted, just press Enter)
    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'experimental.voice.backend',
        'gemini-live',
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
