/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SettingScope,
  isLoadableSettingScope,
  type LoadedSettings,
} from '../config/settings.js';
import { getErrorMessage } from '@google/gemini-cli-core';
import type { ModifiedScope } from './skillSettings.js';

export type HookActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of a hook settings operation.
 */
export interface HookActionResult {
  status: HookActionStatus;
  hookName: string;
  action: 'enable' | 'disable';
  /** Scopes where the hook's state was actually changed. */
  modifiedScopes: ModifiedScope[];
  /** Scopes where the hook was already in the desired state. */
  alreadyInStateScopes: ModifiedScope[];
  /** Error message if status is 'error'. */
  error?: string;
}

/**
 * Enables a hook by removing it from all writable disabled lists (User and Workspace).
 */
export function enableHook(
  settings: LoadedSettings,
  hookName: string,
): HookActionResult {
  const writableScopes = [SettingScope.Workspace, SettingScope.User];
  const foundInDisabledScopes: ModifiedScope[] = [];
  const alreadyEnabledScopes: ModifiedScope[] = [];

  for (const scope of writableScopes) {
    if (isLoadableSettingScope(scope)) {
      const scopePath = settings.forScope(scope).path;
      const scopeDisabled =
        settings.forScope(scope).settings.hooksConfig?.disabled;
      if (scopeDisabled?.includes(hookName)) {
        foundInDisabledScopes.push({ scope, path: scopePath });
      } else {
        alreadyEnabledScopes.push({ scope, path: scopePath });
      }
    }
  }

  if (foundInDisabledScopes.length === 0) {
    return {
      status: 'no-op',
      hookName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: alreadyEnabledScopes,
    };
  }

  const modifiedScopes: ModifiedScope[] = [];
  try {
    for (const { scope, path } of foundInDisabledScopes) {
      if (isLoadableSettingScope(scope)) {
        const currentScopeDisabled =
          settings.forScope(scope).settings.hooksConfig?.disabled ?? [];
        const newDisabled = currentScopeDisabled.filter(
          (name) => name !== hookName,
        );
        settings.setValue(scope, 'hooksConfig.disabled', newDisabled);
        modifiedScopes.push({ scope, path });
      }
    }
  } catch (error) {
    return {
      status: 'error',
      hookName,
      action: 'enable',
      modifiedScopes,
      alreadyInStateScopes: alreadyEnabledScopes,
      error: `Failed to enable hook: ${getErrorMessage(error)}`,
    };
  }

  return {
    status: 'success',
    hookName,
    action: 'enable',
    modifiedScopes,
    alreadyInStateScopes: alreadyEnabledScopes,
  };
}

/**
 * Disables a hook by adding it to the disabled list in the specified scope.
 */
export function disableHook(
  settings: LoadedSettings,
  hookName: string,
  scope: SettingScope,
): HookActionResult {
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      hookName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopePath = settings.forScope(scope).path;
  const currentScopeDisabled =
    settings.forScope(scope).settings.hooksConfig?.disabled ?? [];

  if (currentScopeDisabled.includes(hookName)) {
    return {
      status: 'no-op',
      hookName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [{ scope, path: scopePath }],
    };
  }

  // Check if it's already disabled in the other writable scope
  const otherScope =
    scope === SettingScope.Workspace
      ? SettingScope.User
      : SettingScope.Workspace;
  const alreadyDisabledInOther: ModifiedScope[] = [];

  if (isLoadableSettingScope(otherScope)) {
    const otherScopeDisabled =
      settings.forScope(otherScope).settings.hooksConfig?.disabled;
    if (otherScopeDisabled?.includes(hookName)) {
      alreadyDisabledInOther.push({
        scope: otherScope,
        path: settings.forScope(otherScope).path,
      });
    }
  }

  const newDisabled = [...currentScopeDisabled, hookName];
  settings.setValue(scope, 'hooksConfig.disabled', newDisabled);

  return {
    status: 'success',
    hookName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: alreadyDisabledInOther,
  };
}
