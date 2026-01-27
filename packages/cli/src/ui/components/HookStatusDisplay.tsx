/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { type ActiveHook } from '../types.js';

interface HookStatusDisplayProps {
  activeHooks: ActiveHook[];
}

export const HookStatusDisplay: React.FC<HookStatusDisplayProps> = ({
  activeHooks,
}) => {
  const { t } = useTranslation('ui');
  if (activeHooks.length === 0) {
    return null;
  }

  const label = t('hookStatus.executing', { count: activeHooks.length });
  const displayNames = activeHooks.map((hook) => {
    let name = hook.name;
    if (hook.index && hook.total && hook.total > 1) {
      name += ` (${hook.index}/${hook.total})`;
    }
    return name;
  });

  const text = `${label}: ${displayNames.join(', ')}`;

  return (
    <Text color={theme.status.warning} wrap="truncate">
      {text}
    </Text>
  );
};
