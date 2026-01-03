/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import {
  HookType,
  type HookEventName,
  type HookDefinition,
} from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import type { LoadedSettings } from '../../../config/settings.js';
import { SettingScope } from '../../../config/settings.js';
import { EventSelector } from './EventSelector.js';
import { MatcherInput } from './MatcherInput.js';
import { HookDetailsForm, type HookDetails } from './HookDetailsForm.js';
import { HookReview } from './HookReview.js';
import type { HookWizardStep, HookWizardState } from './types.js';

export interface HookConfigurationWizardProps {
  settings: LoadedSettings;
  onComplete: (success: boolean, message?: string) => void;
  isFocused?: boolean;
}

export function HookConfigurationWizard({
  settings,
  onComplete,
  isFocused = true,
}: HookConfigurationWizardProps): React.JSX.Element {
  const [state, setState] = useState<HookWizardState>({
    step: 'event',
  });
  const [saving, setSaving] = useState(false);

  const handleCancel = useCallback(() => {
    onComplete(false, 'Hook configuration cancelled.');
  }, [onComplete]);

  const handleEventSelect = useCallback((event: HookEventName) => {
    setState((prev) => ({ ...prev, event, step: 'matcher' }));
  }, []);

  const handleMatcherSubmit = useCallback((matcher: string) => {
    setState((prev) => ({ ...prev, matcher, step: 'details' }));
  }, []);

  const handleDetailsSubmit = useCallback((details: HookDetails) => {
    setState((prev) => ({
      ...prev,
      command: details.command,
      name: details.name,
      description: details.description,
      timeout: details.timeout,
      step: 'review',
    }));
  }, []);

  const handleEdit = useCallback((step: HookWizardStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const handleGoBack = useCallback(() => {
    setState((prev) => {
      switch (prev.step) {
        case 'matcher':
          return { ...prev, step: 'event' };
        case 'details':
          return { ...prev, step: 'matcher' };
        case 'review':
          return { ...prev, step: 'details' };
        default:
          return prev;
      }
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!state.event || !state.command) {
      onComplete(false, 'Missing required configuration.');
      return;
    }

    setSaving(true);

    try {
      const newHookDef: HookDefinition = {
        matcher: state.matcher || undefined,
        hooks: [
          {
            type: HookType.Command,
            command: state.command,
            name: state.name || undefined,
            description: state.description || undefined,
            timeout: state.timeout || undefined,
          },
        ],
      };

      const hooksConfig =
        (settings.merged.hooks as Record<string, unknown>) || {};
      const existingHooks =
        (hooksConfig[state.event] as HookDefinition[]) || [];

      const updatedHooks = [...existingHooks, newHookDef];

      settings.setValue(
        SettingScope.Workspace,
        `hooks.${state.event}`,
        updatedHooks,
      );

      const hookName = state.name || state.command;
      onComplete(
        true,
        `✓ Hook "${hookName}" added successfully to ${state.event} event.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onComplete(false, `Failed to save hook: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [state, settings, onComplete]);

  if (saving) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.status.warning}>Saving hook configuration...</Text>
      </Box>
    );
  }

  const steps: HookWizardStep[] = ['event', 'matcher', 'details', 'review'];
  const currentStepIndex = steps.indexOf(state.step);

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Box flexDirection="column">
          <Text bold color={theme.text.primary}>
            Add New Hook
          </Text>
          <Box marginTop={1}>
            {steps.map((step, index) => (
              <Box key={step} marginRight={1}>
                <Text
                  color={
                    index < currentStepIndex
                      ? theme.status.success
                      : index === currentStepIndex
                        ? theme.text.accent
                        : theme.text.secondary
                  }
                >
                  {index < currentStepIndex ? '✓' : index + 1}
                  {index < steps.length - 1 ? ' →' : ''}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.focused}
        paddingX={2}
        paddingY={1}
      >
        {state.step === 'event' && (
          <EventSelector
            selectedEvent={state.event}
            onSelect={handleEventSelect}
            onCancel={handleCancel}
            isFocused={isFocused}
          />
        )}

        {state.step === 'matcher' && (
          <MatcherInput
            initialValue={state.matcher}
            onSubmit={handleMatcherSubmit}
            onBack={handleGoBack}
            onCancel={handleCancel}
            isFocused={isFocused}
          />
        )}

        {state.step === 'details' && (
          <HookDetailsForm
            initialCommand={state.command}
            initialName={state.name}
            initialDescription={state.description}
            initialTimeout={state.timeout}
            onSubmit={handleDetailsSubmit}
            onBack={handleGoBack}
            onCancel={handleCancel}
            isFocused={isFocused}
          />
        )}

        {state.step === 'review' && state.event && state.command && (
          <HookReview
            event={state.event}
            matcher={state.matcher}
            command={state.command}
            name={state.name}
            description={state.description}
            timeout={state.timeout}
            onConfirm={handleConfirm}
            onEdit={handleEdit}
            onCancel={handleCancel}
            isFocused={isFocused}
          />
        )}
      </Box>
    </Box>
  );
}
