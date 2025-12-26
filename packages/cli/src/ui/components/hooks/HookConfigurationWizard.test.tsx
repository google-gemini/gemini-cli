/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { act } from 'react';
import { HookEventName } from '@google/gemini-cli-core';
import { HookConfigurationWizard } from './HookConfigurationWizard.js';
import type { LoadedSettings } from '../../../config/settings.js';
import { SettingScope } from '../../../config/settings.js';

const getGlobalCallbacks = (key: string): Record<string, unknown> =>
  (global as unknown as Record<string, Record<string, unknown>>)[key];

vi.mock('./EventSelector.js', () => ({
  EventSelector: vi.fn(({ onSelect, onCancel }) => {
    (global as unknown as Record<string, unknown>)['__eventSelectorCallbacks'] =
      {
        onSelect,
        onCancel,
      };
    return null;
  }),
}));

vi.mock('./MatcherInput.js', () => ({
  MatcherInput: vi.fn(({ onSubmit, onBack, onCancel }) => {
    (global as unknown as Record<string, unknown>)['__matcherInputCallbacks'] =
      {
        onSubmit,
        onBack,
        onCancel,
      };
    return null;
  }),
}));

vi.mock('./HookDetailsForm.js', () => ({
  HookDetailsForm: vi.fn(({ onSubmit, onBack, onCancel }) => {
    (global as unknown as Record<string, unknown>)[
      '__hookDetailsFormCallbacks'
    ] = {
      onSubmit,
      onBack,
      onCancel,
    };
    return null;
  }),
}));

vi.mock('./HookReview.js', () => ({
  HookReview: vi.fn(({ onConfirm, onEdit, onCancel }) => {
    (global as unknown as Record<string, unknown>)['__hookReviewCallbacks'] = {
      onConfirm,
      onEdit,
      onCancel,
    };
    return null;
  }),
}));

describe('HookConfigurationWizard', () => {
  const mockSettings: LoadedSettings = {
    merged: {
      hooks: {},
    },
    setValue: vi.fn(),
    save: vi.fn(),
  } as unknown as LoadedSettings;

  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the wizard header with progress indicators', () => {
    const { lastFrame } = renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    expect(lastFrame()).toContain('Add New Hook');
    expect(lastFrame()).toContain('1');
    expect(lastFrame()).toContain('→');
  });

  it('should start on the event step', () => {
    renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    const callbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
      onSelect: (event: HookEventName) => void;
      onCancel: () => void;
    };

    expect(callbacks).toBeDefined();
    expect(typeof callbacks.onSelect).toBe('function');
  });

  it('should progress through steps correctly', () => {
    renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    // Step 1: Select event
    const eventCallbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
      onSelect: (event: HookEventName) => void;
    };
    act(() => {
      eventCallbacks.onSelect(HookEventName.BeforeTool);
    });

    // Step 2: Enter matcher
    const matcherCallbacks = getGlobalCallbacks('__matcherInputCallbacks') as {
      onSubmit: (matcher: string) => void;
    };
    act(() => {
      matcherCallbacks.onSubmit('read_file');
    });

    // Step 3: Enter details
    const detailsCallbacks = getGlobalCallbacks(
      '__hookDetailsFormCallbacks',
    ) as {
      onSubmit: (details: {
        command: string;
        name?: string;
        description?: string;
        timeout?: number;
      }) => void;
    };
    act(() => {
      detailsCallbacks.onSubmit({
        command: '/path/to/script.sh',
        name: 'my-hook',
      });
    });

    const reviewCallbacks = getGlobalCallbacks('__hookReviewCallbacks') as {
      onConfirm: () => void;
    };
    expect(reviewCallbacks).toBeDefined();
  });

  it('should call onComplete with cancel message when cancelled from event step', () => {
    renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    const callbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
      onCancel: () => void;
    };

    act(() => {
      callbacks.onCancel();
    });

    expect(onComplete).toHaveBeenCalledWith(
      false,
      'Hook configuration cancelled.',
    );
  });

  it('should save hook configuration when confirmed', async () => {
    renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    act(() => {
      const eventCallbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
        onSelect: (event: HookEventName) => void;
      };
      eventCallbacks.onSelect(HookEventName.BeforeTool);
    });

    act(() => {
      const matcherCallbacks = getGlobalCallbacks(
        '__matcherInputCallbacks',
      ) as { onSubmit: (matcher: string) => void };
      matcherCallbacks.onSubmit('*');
    });

    act(() => {
      const detailsCallbacks = getGlobalCallbacks(
        '__hookDetailsFormCallbacks',
      ) as {
        onSubmit: (details: { command: string }) => void;
      };
      detailsCallbacks.onSubmit({ command: '/path/to/script.sh' });
    });

    await act(async () => {
      const reviewCallbacks = getGlobalCallbacks('__hookReviewCallbacks') as {
        onConfirm: () => void;
      };
      reviewCallbacks.onConfirm();
    });

    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'hooks.BeforeTool',
      expect.arrayContaining([
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({
              type: 'command',
              command: '/path/to/script.sh',
            }),
          ]),
        }),
      ]),
    );
    expect(onComplete).toHaveBeenCalledWith(
      true,
      expect.stringContaining('added successfully'),
    );
  });

  it('should allow editing a previous step from review', () => {
    renderWithProviders(
      <HookConfigurationWizard
        settings={mockSettings}
        onComplete={onComplete}
      />,
    );

    act(() => {
      const eventCallbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
        onSelect: (event: HookEventName) => void;
      };
      eventCallbacks.onSelect(HookEventName.BeforeTool);
    });

    act(() => {
      const matcherCallbacks = getGlobalCallbacks(
        '__matcherInputCallbacks',
      ) as { onSubmit: (matcher: string) => void };
      matcherCallbacks.onSubmit('*');
    });

    act(() => {
      const detailsCallbacks = getGlobalCallbacks(
        '__hookDetailsFormCallbacks',
      ) as {
        onSubmit: (details: { command: string }) => void;
      };
      detailsCallbacks.onSubmit({ command: '/path/to/script.sh' });
    });

    act(() => {
      const reviewCallbacks = getGlobalCallbacks('__hookReviewCallbacks') as {
        onEdit: (step: string) => void;
      };
      reviewCallbacks.onEdit('event');
    });

    const eventCallbacks = getGlobalCallbacks('__eventSelectorCallbacks') as {
      onSelect: (event: HookEventName) => void;
    };
    expect(eventCallbacks).toBeDefined();
  });
});
