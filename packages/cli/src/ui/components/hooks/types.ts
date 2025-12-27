/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HookEventName } from '@google/gemini-cli-core';

export type HookWizardStep = 'event' | 'matcher' | 'details' | 'review';

export interface HookWizardState {
  step: HookWizardStep;
  event?: HookEventName;
  matcher?: string;
  command?: string;
  name?: string;
  description?: string;
  timeout?: number;
  sequential?: boolean;
}

export interface WizardStepProps {
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export interface HookEventItem {
  event: HookEventName;
  title: string;
  description: string;
}

export const HOOK_EVENTS: HookEventItem[] = [
  {
    event: HookEventName.BeforeTool,
    title: 'BeforeTool',
    description: 'Execute before tool execution. Can intercept or validate.',
  },
  {
    event: HookEventName.AfterTool,
    title: 'AfterTool',
    description: 'Execute after tool execution. Can process results or log.',
  },
  {
    event: HookEventName.BeforeAgent,
    title: 'BeforeAgent',
    description: 'Execute before agent loop starts. Setup context.',
  },
  {
    event: HookEventName.AfterAgent,
    title: 'AfterAgent',
    description: 'Execute after agent loop completes. Cleanup or summarize.',
  },
  {
    event: HookEventName.Notification,
    title: 'Notification',
    description: 'Execute on notification events (errors, warnings, info).',
  },
  {
    event: HookEventName.SessionStart,
    title: 'SessionStart',
    description: 'Execute when a session starts. Initialize resources.',
  },
  {
    event: HookEventName.SessionEnd,
    title: 'SessionEnd',
    description: 'Execute when a session ends. Persist data or cleanup.',
  },
  {
    event: HookEventName.PreCompress,
    title: 'PreCompress',
    description: 'Execute before chat history compression.',
  },
  {
    event: HookEventName.BeforeModel,
    title: 'BeforeModel',
    description: 'Execute before LLM requests. Modify prompts or context.',
  },
  {
    event: HookEventName.AfterModel,
    title: 'AfterModel',
    description: 'Execute after LLM responses. Process outputs.',
  },
  {
    event: HookEventName.BeforeToolSelection,
    title: 'BeforeToolSelection',
    description: 'Execute before tool selection. Filter or prioritize tools.',
  },
];

export const DEFAULT_HOOK_TIMEOUT = 60000;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCommand(command: string): ValidationResult {
  if (!command || command.trim().length === 0) {
    return { valid: false, error: 'Command is required' };
  }
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Command cannot be empty' };
  }
  return { valid: true };
}

export function validateMatcher(matcher: string): ValidationResult {
  if (!matcher || matcher === '*' || matcher === '') {
    return { valid: true };
  }

  if (matcher.startsWith('/') && matcher.endsWith('/')) {
    try {
      const pattern = matcher.slice(1, -1);
      new RegExp(pattern);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid regex pattern' };
    }
  }

  return { valid: true };
}

export function validateTimeout(timeout: number | undefined): ValidationResult {
  if (timeout === undefined) {
    return { valid: true };
  }
  if (typeof timeout !== 'number' || isNaN(timeout)) {
    return { valid: false, error: 'Timeout must be a number' };
  }
  if (timeout <= 0) {
    return { valid: false, error: 'Timeout must be positive' };
  }
  if (timeout > 300000) {
    return {
      valid: false,
      error: 'Timeout cannot exceed 5 minutes (300000ms)',
    };
  }
  return { valid: true };
}

export function validateName(name: string | undefined): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: true };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return {
      valid: false,
      error:
        'Name should only contain letters, numbers, hyphens, and underscores',
    };
  }
  return { valid: true };
}
