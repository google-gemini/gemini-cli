/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDialog } from './ModelDialog.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
} from '@google/gemini-cli-core';
import type { Config, ModelSlashCommandEvent } from '@google/gemini-cli-core';

// Mock dependencies
const mockGetDisplayString = vi.fn();
const mockLogModelSlashCommand = vi.fn();
const mockModelSlashCommandEvent = vi.fn();

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
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
  };
});

describe('<ModelDialog />', () => {
  const mockSetModel = vi.fn();
  const mockGetModel = vi.fn();
  const mockOnClose = vi.fn();
  const mockGetHasAccessToPreviewModel = vi.fn();

  interface MockConfig extends Partial<Config> {
    setModel: (model: string, isTemporary?: boolean) => void;
    getModel: () => string;
    getHasAccessToPreviewModel: () => boolean;
  }

  const mockConfig: MockConfig = {
    setModel: mockSetModel,
    getModel: mockGetModel,
    getHasAccessToPreviewModel: mockGetHasAccessToPreviewModel,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetModel.mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    mockGetHasAccessToPreviewModel.mockReturnValue(false);

    // Default implementation for getDisplayString
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === 'auto-gemini-2.5') return 'Auto (Gemini 2.5)';
      if (val === 'auto-gemini-3') return 'Auto (Preview)';
      return val;
    });
  });

  const renderComponent = (contextValue = mockConfig as Config) =>
    render(
      <KeypressProvider>
        <ConfigContext.Provider value={contextValue}>
          <ModelDialog onClose={mockOnClose} />
        </ConfigContext.Provider>
      </KeypressProvider>,
    );

  const waitForUpdate = () =>
    new Promise((resolve) => setTimeout(resolve, 150));

  it('renders the initial "main" view correctly', () => {
    const { lastFrame } = renderComponent();
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Remember model for future sessions: false');
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
  });

  it('switches to "manual" view when "Manual" is selected', async () => {
    const { lastFrame, stdin } = renderComponent();

    // Select "Manual" (index 1)
    // Press down arrow to move to "Manual"
    stdin.write('\u001B[B'); // Arrow Down
    await waitForUpdate();

    // Press enter to select
    stdin.write('\r');
    await waitForUpdate();

    // Should now show manual options
    expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);
    expect(lastFrame()).toContain(DEFAULT_GEMINI_FLASH_MODEL);
    expect(lastFrame()).toContain(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });

  it('sets model and closes when a model is selected in "main" view', async () => {
    const { stdin } = renderComponent();

    // Select "Auto" (index 0)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(
      DEFAULT_GEMINI_MODEL_AUTO,
      true, // Session only by default
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('sets model and closes when a model is selected in "manual" view', async () => {
    const { stdin } = renderComponent();

    // Navigate to Manual (index 1) and select
    stdin.write('\u001B[B');
    await waitForUpdate();
    stdin.write('\r');
    await waitForUpdate();

    // Now in manual view. Default selection is first item (DEFAULT_GEMINI_MODEL)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL, true);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('toggles persist mode with Tab key', async () => {
    const { lastFrame, stdin } = renderComponent();

    expect(lastFrame()).toContain('Remember model for future sessions: false');

    // Press Tab to toggle persist mode
    stdin.write('\t');
    await waitForUpdate();

    expect(lastFrame()).toContain('Remember model for future sessions: true');

    // Select "Auto" (index 0)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(
      DEFAULT_GEMINI_MODEL_AUTO,
      false, // Persist enabled
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes dialog on escape in "main" view', async () => {
    const { stdin } = renderComponent();

    stdin.write('\u001B'); // Escape
    await waitForUpdate();

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('goes back to "main" view on escape in "manual" view', async () => {
    const { lastFrame, stdin } = renderComponent();

    // Go to manual view
    stdin.write('\u001B[B');
    await waitForUpdate();
    stdin.write('\r');
    await waitForUpdate();

    expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);

    // Press Escape
    stdin.write('\u001B');
    await waitForUpdate();

    expect(mockOnClose).not.toHaveBeenCalled();
    // Should be back to main view (Manual option visible)
    expect(lastFrame()).toContain('Manual');
  });
});
