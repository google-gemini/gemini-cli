/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export const PROVIDER_COLORS: Record<string, string> = {
  'claude-code': '#C15F3C', // Claude Orange
  codex: '#FFFFFF', // Codex White
  gemini: '#A855F7', // Gemini Purple
  antigravity: '#93C5FD', // Antigravity Light Blue
  gemma: '#60A5FA', // Gemma Blue
};

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'antigravity':
      return 'Antigravity';
    case 'gemma':
      return 'Gemma';
    default:
      return 'Gemini CLI';
  }
}

export const ProviderTag: React.FC<{ provider: string }> = ({ provider }) => {
  const label = getProviderLabel(provider);
  const color = PROVIDER_COLORS[provider] || theme.text.secondary;

  return (
    <Text color={color} bold>
      [{label}]
    </Text>
  );
};
