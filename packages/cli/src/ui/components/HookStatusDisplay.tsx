/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { type ActiveHook } from '../types.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';

interface HookStatusDisplayProps {
  activeHooks: ActiveHook[];
}

export const HookStatusDisplay: React.FC<HookStatusDisplayProps> = ({
  activeHooks,
}) => {
  if (activeHooks.length === 0) {
    return null;
  }

  // Define which hook sources are considered "user" hooks that should be shown explicitly.
  const USER_HOOK_SOURCES = ['user', 'project', 'runtime'];

  const userHooks = activeHooks.filter(
    (h) => !h.source || USER_HOOK_SOURCES.includes(h.source),
  );

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
    return <Text color="inherit">{text}</Text>;
  }

  // If only system/extension hooks are running, show a generic message.
  return <Text color="inherit">{GENERIC_WORKING_LABEL}</Text>;
};
