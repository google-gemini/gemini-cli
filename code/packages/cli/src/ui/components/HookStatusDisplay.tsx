/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { type ActiveHook } from '../types.js';
import { isUserVisibleHook } from '@google/gemini-cli-core';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { theme } from '../semantic-colors.js';

interface HookStatusDisplayProps {
  activeHooks: ActiveHook[];
}

export const HookStatusDisplay: React.FC<HookStatusDisplayProps> = ({
  activeHooks,
}) => {
  if (activeHooks.length === 0) {
    return null;
  }

  const userHooks = activeHooks.filter((h) => isUserVisibleHook(h.source));

  if (userHooks.length > 0) {
    const label = userHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
    const displayNames = userHooks.map((hook) => {
      let name = hook.name;
      if (hook.index && hook.total && hook.total > 1) {
        name += ` (${hook.index}/${hook.total})`;
      }
      return name;
    });

    const text = `${label}: ${displayNames.join(', ')}`;
    return (
      <Text color={theme.text.secondary} italic={true}>
        {text}
      </Text>
    );
  }

  // If only system/extension hooks are running, show a generic message.
  return (
    <Text color={theme.text.secondary} italic={true}>
      {GENERIC_WORKING_LABEL}
    </Text>
  );
};
