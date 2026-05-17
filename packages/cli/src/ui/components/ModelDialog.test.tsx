/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ModelDialog } from './ModelDialog.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { createMockSettings } from '../../test-utils/settings.js';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  AuthType,
  GEMMA_MODEL_ALIAS_4,
  GEMMA_MODEL_ALIAS_4_26B,
  GEMMA_MODEL_ALIAS_4_31B,
  GEMMA_MODEL_ALIAS_4_31B_CLOUD,
  GEMMA_MODEL_ALIAS_4_E4B,
  GEMMA_MODEL_ALIAS_4_E2B,
} from '@google/gemini-cli-core';
import type { Config, ModelSlashCommandEvent } from '@google/gemini-cli-core';

// Mock dependencies
const mockGetDisplayString = vi.fn();
const mockLogModelSlashCommand = vi.fn();
const mockModelSlashCommandEvent = vi.fn();
const mockDiscoverBackends = vi.fn().mockResolvedValue({ backends: [] });

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getDisplayString: (val: string) => mockGetDisplayString(val),
    logModelSlashCommand: (config: Config, event: ModelSlashCommandEvent) =>
      mockLogModelSlashCommand(config, event),
    ModelSlashCommandEvent: class {
      constructor(model: string) {
        mockModelSlashCommandEvent(model);
      }
    },
    LocalModelDiscoveryService: class {
      discoverBackends = mockDiscoverBackends;
    },
    PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL: 'gemini-3.1-flash-lite-preview',
  };
});

describe('<ModelDialog />', () => {
  const mockSetModel = vi.fn();
  const mockGetModel = vi.fn();
  const mockOnClose = vi.fn();
  const mockGetHasAccessToPreviewModel = vi.fn();
  const mockGetGemini31LaunchedSync = vi.fn();
  const mockGetGemini31FlashLiteLaunchedSync = vi.fn();
  const mockGetProModelNoAccess = vi.fn();
  const mockGetProModelNoAccessSync = vi.fn();
  const mockRefreshAuth = vi.fn();

  interface MockConfig extends Partial<Config> {
    setModel: (model: string, isTemporary?: boolean) => void;
    getModel: () => string;
    getHasAccessToPreviewModel: () => boolean;
    getIdeMode: () => boolean;
    getGemini31LaunchedSync: () => boolean;
    getGemini31FlashLiteLaunchedSync: () => boolean;
    getProModelNoAccess: () => Promise<boolean>;
    getProModelNoAccessSync: () => boolean;
    getExperimentalGemma: () => boolean;
    refreshAuth: (...args: unknown[]) => Promise<void>;
    getLastRetrievedQuota: () =>
      | {
          buckets: Array<{
            modelId?: string;
            remainingFraction?: number;
            resetTime?: string;
          }>;
        }
      | undefined;
  }

  const mockConfig: MockConfig = {
    setModel: mockSetModel,
    getModel: mockGetModel,
    getHasAccessToPreviewModel: mockGetHasAccessToPreviewModel,
    getIdeMode: () => false,
    getGemini31LaunchedSync: mockGetGemini31LaunchedSync,
    getGemini31FlashLiteLaunchedSync: mockGetGemini31FlashLiteLaunchedSync,
    getProModelNoAccess: mockGetProModelNoAccess,
    getProModelNoAccessSync: mockGetProModelNoAccessSync,
    getExperimentalGemma: () => false,
    refreshAuth: mockRefreshAuth,
    getLastRetrievedQuota: () => ({ buckets: [] }),
    getSessionId: () => 'test-session-id',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockDiscoverBackends.mockResolvedValue({ backends: [] });
    mockGetModel.mockReturnValue(GEMINI_MODEL_ALIAS_AUTO);
    mockGetHasAccessToPreviewModel.mockReturnValue(false);
    mockGetGemini31LaunchedSync.mockReturnValue(false);
    mockGetGemini31FlashLiteLaunchedSync.mockReturnValue(false);
    mockGetProModelNoAccess.mockResolvedValue(false);
    mockGetProModelNoAccessSync.mockReturnValue(false);
    mockRefreshAuth.mockResolvedValue(undefined);

    // Default implementation for getDisplayString
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === 'auto') return 'Auto';
      return val;
    });
  });

  const renderComponent = async (
    configValue = mockConfig as Config,
    authType = AuthType.LOGIN_WITH_GOOGLE,
    settingsOverrides: Record<string, unknown> = {},
  ) => {
    const settings = createMockSettings({
      security: {
        auth: {
          selectedType: authType,
        },
      },
      ...settingsOverrides,
    });

    const result = await renderWithProviders(
      <ModelDialog onClose={mockOnClose} />,
      {
        config: configValue,
        settings,
      },
    );
    return result;
  };

  it('renders the initial "main" view correctly', async () => {
    const { lastFrame, unmount } = await renderComponent();
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Remember model for future sessions: false');
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
    unmount();
  });

  it('closes dialog on escape in "manual" view for users with no pro access', async () => {
    mockGetProModelNoAccessSync.mockReturnValue(true);
    mockGetProModelNoAccess.mockResolvedValue(true);
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Already in manual view
    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('switches to "manual" view when "Manual" is selected and uses getDisplayString for models', async () => {
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === DEFAULT_GEMINI_MODEL) return 'Formatted Pro Model';
      if (val === DEFAULT_GEMINI_FLASH_MODEL) return 'Formatted Flash Model';
      if (val === DEFAULT_GEMINI_FLASH_LITE_MODEL)
        return 'Formatted Lite Model';
      return val;
    });

    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    // Select "Manual" (index 1)
    // Press down arrow to move to "Manual"
    await act(async () => {
      stdin.write('\u001B[B'); // Arrow Down
    });
    await waitUntilReady();

    // Press enter to select
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    // Should now show manual options
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Formatted Pro Model');
      expect(output).toContain('Formatted Flash Model');
      expect(output).toContain('Formatted Lite Model');
    });
    unmount();
  });

  it('sets model and closes when a model is selected in "main" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Select "Auto" (index 0)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(
        GEMINI_MODEL_ALIAS_AUTO,
        true, // Session only by default
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('shows local Gemma mode when a local backend auth type is active', async () => {
    mockGetDisplayString.mockImplementation((val: string) => val);
    const { lastFrame, unmount } = await renderComponent(
      mockConfig as Config,
      AuthType.USE_LOCAL_OLLAMA,
      {
        localModel: {
          baseUrl: 'http://127.0.0.1:11434',
        },
      },
    );

    expect(lastFrame()).toContain(GEMMA_MODEL_ALIAS_4);
    expect(lastFrame()).toContain('Manual');
    unmount();
  });

  it('sets model and closes when a model is selected in "manual" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Navigate to Manual (index 1) and select
    await act(async () => {
      stdin.write('\u001B[B');
    });
    await waitUntilReady();
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    // Now in manual view. Default selection is first item (DEFAULT_GEMINI_MODEL)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL, true);
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('toggles persist mode with Tab key', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    expect(lastFrame()).toContain('Remember model for future sessions: false');

    // Press Tab to toggle persist mode
    await act(async () => {
      stdin.write('\t');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain('Remember model for future sessions: true');
    });

    // Select "Auto" (index 0)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(
        GEMINI_MODEL_ALIAS_AUTO,
        false, // Persist enabled
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('closes dialog on escape in "main" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('goes back to "main" view on escape in "manual" view', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    // Go to manual view
    await act(async () => {
      stdin.write('\u001B[B');
    });
    await waitUntilReady();
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);
    });

    // Press Escape
    await act(async () => {
      stdin.write('\u001B');
    });
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).not.toHaveBeenCalled();
      // Should be back to main view (Manual option visible)
      expect(lastFrame()).toContain('Manual');
    });
    unmount();
  });

  it('shows the preferred manual model in the main view option using getDisplayString', async () => {
    mockGetModel.mockReturnValue(DEFAULT_GEMINI_MODEL);
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === DEFAULT_GEMINI_MODEL) return 'My Custom Model Display';
      if (val === 'auto') return 'Auto';
      return val;
    });
    const { lastFrame, unmount } = await renderComponent();

    expect(lastFrame()).toContain('Manual (My Custom Model Display)');
    unmount();
  });

  describe('Preview Models', () => {
    beforeEach(() => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
    });

    it('shows Auto in main view when access is granted', async () => {
      const { lastFrame, unmount } = await renderComponent();
      expect(lastFrame()).toContain('Auto');
      unmount();
    });

    it('shows Gemini 3 models in manual view when Gemini 3.1 is NOT launched', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(false);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent();

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toContain(PREVIEW_GEMINI_MODEL);
      expect(output).toContain(PREVIEW_GEMINI_FLASH_MODEL);
      unmount();
    });

    it('shows Gemini 3.1 models in manual view when Gemini 3.1 IS launched', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(true);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_VERTEX_AI);

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toContain(PREVIEW_GEMINI_3_1_MODEL);
      expect(output).toContain(PREVIEW_GEMINI_FLASH_MODEL);
      unmount();
    });

    it('uses custom tools model when Gemini 3.1 IS launched and auth is Gemini API Key', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(true);
      const { stdin, waitUntilReady, unmount } = await renderComponent(
        mockConfig as Config,
        AuthType.USE_GEMINI,
      );

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      // Select Gemini 3.1 (first item in preview section)
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockSetModel).toHaveBeenCalledWith(
          PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
          true,
        );
      });
      unmount();
    });

    it('shows Flash Lite Preview model regardless of tier when flag is enabled', async () => {
      mockGetProModelNoAccessSync.mockReturnValue(false);
      mockGetProModelNoAccess.mockResolvedValue(false);
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetGemini31FlashLiteLaunchedSync.mockReturnValue(true);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent();

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toContain(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL);
      unmount();
    });
  });

  describe('Local Model Discovery Integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockDiscoverBackends.mockResolvedValue({ backends: [] });
      mockGetDisplayString.mockImplementation((val: string) => val);
      mockGetModel.mockReturnValue(GEMMA_MODEL_ALIAS_4);
    });

    it('shows discovered backend models with provider labels', async () => {
      mockDiscoverBackends.mockResolvedValue({
        backends: [
          {
            authType: AuthType.USE_LOCAL_OLLAMA,
            backend: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            models: [{ id: 'gemma4:31b' }],
            gemma4Models: [{ id: 'gemma4:31b' }],
            gemma4Metadata: [],
          },
        ],
        preferredBackend: {
          authType: AuthType.USE_LOCAL_OLLAMA,
          backend: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          models: [{ id: 'gemma4:31b' }],
          gemma4Models: [{ id: 'gemma4:31b' }],
          gemma4Metadata: [],
        },
      });

      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_LOCAL_OLLAMA);

      // Navigate to Manual (index 1)
      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain('Ollama');
        expect(output).toContain('gemma4:31b');
      });
      unmount();
    });

    it('falls back to static aliases when no backends are discovered', async () => {
      mockDiscoverBackends.mockResolvedValue({ backends: [] });

      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_LOCAL_OLLAMA);

      // Navigate to Manual (index 1)
      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain(GEMMA_MODEL_ALIAS_4);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_26B);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_31B);
      });
      unmount();
    });

    it('groups models by provider when multiple backends are discovered', async () => {
      mockDiscoverBackends.mockResolvedValue({
        backends: [
          {
            authType: AuthType.USE_LOCAL_OLLAMA,
            backend: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            models: [{ id: 'gemma4:31b' }, { id: 'gemma4:e4b' }],
            gemma4Models: [{ id: 'gemma4:31b' }, { id: 'gemma4:e4b' }],
            gemma4Metadata: [],
          },
          {
            authType: AuthType.USE_LOCAL_LM_STUDIO,
            backend: 'lm-studio',
            baseUrl: 'http://localhost:1234/v1',
            models: [{ id: 'google/gemma-4-26b-a4b' }],
            gemma4Models: [{ id: 'google/gemma-4-26b-a4b' }],
            gemma4Metadata: [],
          },
        ],
        preferredBackend: null,
      });

      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_LOCAL_OLLAMA);

      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain('Ollama');
        expect(output).toContain('gemma4:31b');
        expect(output).toContain('gemma4:e4b');
        expect(output).toContain('LM Studio');
        expect(output).toContain('google/gemma-4-26b-a4b');
      });
      unmount();
    });

    it('refreshes auth with the discovered provider when selecting a discovered model', async () => {
      mockDiscoverBackends.mockResolvedValue({
        backends: [
          {
            authType: AuthType.USE_LOCAL_OLLAMA,
            backend: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            models: [{ id: 'gemma4:31b' }],
            gemma4Models: [{ id: 'gemma4:31b' }],
            gemma4Metadata: [],
          },
          {
            authType: AuthType.USE_LOCAL_LM_STUDIO,
            backend: 'lm-studio',
            baseUrl: 'http://localhost:1234/v1',
            models: [{ id: 'google/gemma-4-26b-a4b' }],
            gemma4Models: [{ id: 'google/gemma-4-26b-a4b' }],
            gemma4Metadata: [],
          },
        ],
        preferredBackend: null,
      });

      const { stdin, waitUntilReady, unmount } = await renderComponent(
        mockConfig as Config,
        AuthType.USE_LOCAL_OLLAMA,
        {
          localModel: {
            providers: {
              'lm-studio': {
                baseUrl: 'http://localhost:1234',
              },
            },
          },
        },
      );

      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockSetModel).toHaveBeenCalledWith(
          'google/gemma-4-26b-a4b',
          true,
        );
        expect(mockRefreshAuth).toHaveBeenCalledWith(
          AuthType.USE_LOCAL_LM_STUDIO,
          undefined,
          'http://localhost:1234',
        );
      });
      unmount();
    });

    it('shows all 6 Gemma 4 aliases when falling back to static list', async () => {
      mockDiscoverBackends.mockResolvedValue({ backends: [] });

      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_LOCAL_OLLAMA);

      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain(GEMMA_MODEL_ALIAS_4);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_26B);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_31B);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_31B_CLOUD);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_E4B);
        expect(output).toContain(GEMMA_MODEL_ALIAS_4_E2B);
      });
      unmount();
    });

    it('renders discovered models with metadata descriptions', async () => {
      mockDiscoverBackends.mockResolvedValue({
        backends: [
          {
            authType: AuthType.USE_LOCAL_OLLAMA,
            backend: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            models: [{ id: 'gemma4:26b' }],
            gemma4Models: [{ id: 'gemma4:26b' }],
            gemma4Metadata: [
              {
                id: 'gemma4:26b',
                paramSize: '25.2B',
                quantization: 'Q4_K_M',
                contextLength: 262144,
              },
            ],
          },
        ],
        preferredBackend: null,
      });

      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_LOCAL_OLLAMA);

      await act(async () => {
        stdin.write('\u001B[B');
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain('Ollama');
        expect(output).toContain('gemma4:26b');
      });
      unmount();
    });
  });
});
