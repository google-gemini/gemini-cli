/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../config/settings.js';
import { isLoadableSettingScope, SettingScope } from '../config/settings.js';
import { settingExistsInScope } from './settingsUtils.js';

/**
 * Helper function to get scope items for radio button selects
 */
export function getScopeItems(t: (key: string) => string): Array<{
  label: string;
  value: LoadableSettingScope;
}> {
  return [
    { label: t('editor.userSettings'), value: SettingScope.User },
    {
      label: t('editor.workspaceSettings'),
      value: SettingScope.Workspace,
    },
    { label: t('editor.systemSettings'), value: SettingScope.System },
  ];
}

/**
 * Generate scope message for a specific setting
 */
export function getScopeMessageForSetting(
  settingKey: string,
  selectedScope: LoadableSettingScope,
  settings: LoadedSettings,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const otherScopes = Object.values(SettingScope)
    .filter(isLoadableSettingScope)
    .filter((scope) => scope !== selectedScope);

  const modifiedInOtherScopes = otherScopes.filter((scope) => {
    const scopeSettings = settings.forScope(scope).settings;
    return settingExistsInScope(settingKey, scopeSettings);
  });

  if (modifiedInOtherScopes.length === 0) {
    return '';
  }

  const modifiedScopesStr = modifiedInOtherScopes
    .map((s) => t(`scopes.${s.toLowerCase()}`))
    .join(', ');
  const currentScopeSettings = settings.forScope(selectedScope).settings;
  const existsInCurrentScope = settingExistsInScope(
    settingKey,
    currentScopeSettings,
  );

  return existsInCurrentScope
    ? t('scopes.alsoModifiedIn', { scopes: modifiedScopesStr })
    : t('scopes.modifiedIn', { scopes: modifiedScopesStr });
}
