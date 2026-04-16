/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { VoiceModelDialog } from './VoiceModelDialog.js';

const mockIsBinaryAvailable = vi.fn();
const mockDownloadModel = vi.fn();
const mockIsModelInstalled = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const { EventEmitter } = await import('node:events');

  class MockWhisperModelManager extends EventEmitter {
    isModelInstalled(modelName: string) {
      return mockIsModelInstalled(modelName);
    }

    async downloadModel(modelName: string) {
      return mockDownloadModel(modelName);
    }
  }

  return {
    ...actual,
    isBinaryAvailable: (name: string) => mockIsBinaryAvailable(name),
    WhisperModelManager: MockWhisperModelManager,
  };
});

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('<VoiceModelDialog />', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBinaryAvailable.mockReturnValue(true);
    mockIsModelInstalled.mockImplementation(
      (modelName: string) => modelName === 'ggml-base.en.bin',
    );
    mockDownloadModel.mockResolvedValue(undefined);
  });

  it('closes immediately when Gemini Live is selected after acknowledgement', async () => {
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <VoiceModelDialog onClose={mockOnClose} />,
      {
        settings: createMockSettings({
          voice: {
            backend: 'gemini-live',
            geminiLiveNoticeAcknowledged: true,
          },
        }),
      },
    );

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('shows the Gemini Live notice the first time it is selected and closes after confirmation', async () => {
    const { stdin, lastFrame, waitUntilReady, unmount } =
      await renderWithProviders(<VoiceModelDialog onClose={mockOnClose} />, {
        settings: createMockSettings({
          voice: {
            backend: 'whisper',
            geminiLiveNoticeAcknowledged: false,
          },
        }),
      });

    await act(async () => {
      stdin.write('\u001B[A');
    });
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain('Gemini Live Data Flow');
      expect(lastFrame()).toContain('sent to Gemini cloud services');
    });

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('closes immediately when an installed Whisper model is selected', async () => {
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <VoiceModelDialog onClose={mockOnClose} />,
      {
        settings: createMockSettings({
          voice: {
            backend: 'whisper',
            whisperModel: 'ggml-base.en.bin',
          },
        }),
      },
    );

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('stays open during Whisper download and closes after success', async () => {
    const deferred = createDeferred();
    mockIsModelInstalled.mockReturnValue(false);
    mockDownloadModel.mockReturnValue(deferred.promise);

    const { stdin, lastFrame, waitUntilReady, unmount } =
      await renderWithProviders(<VoiceModelDialog onClose={mockOnClose} />, {
        settings: createMockSettings({
          voice: {
            backend: 'whisper',
            whisperModel: 'ggml-base.en.bin',
          },
        }),
      });

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    expect(mockOnClose).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(lastFrame()).toContain('Downloading ggml-base.en.bin');
    });

    await act(async () => {
      deferred.resolve();
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });
});
