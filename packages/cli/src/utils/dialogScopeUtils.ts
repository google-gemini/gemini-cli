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
import { t } from '../ui/utils/i18n.js';

/**
 * Shared scope labels for dialog components that need to display setting scopes
 */
export const getScopeLabels = () =>
  ({
    [SettingScope.User]: t('settings.scope.user', { default: 'User Settings' }),
    [SettingScope.Workspace]: t('settings.scope.workspace', {
      default: 'Workspace Settings',
    }),
    [SettingScope.System]: t('settings.scope.system', {
      default: 'System Settings',
    }),
  }) as const;

/**
 * Helper function to get scope items for radio button selects
 */
export function getScopeItems(): Array<{
  label: string;
  value: LoadableSettingScope;
}> {
  const labels = getScopeLabels();
  return [
    { label: labels[SettingScope.User], value: SettingScope.User },
    {
      label: labels[SettingScope.Workspace],
      value: SettingScope.Workspace,
    },
    { label: labels[SettingScope.System], value: SettingScope.System },
  ];
}

/**
 * Generate scope message for a specific setting
 */
export function getScopeMessageForSetting(
  settingKey: string,
  selectedScope: LoadableSettingScope,
  settings: LoadedSettings,
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

  const modifiedScopesStr = modifiedInOtherScopes.join(', ');
  const currentScopeSettings = settings.forScope(selectedScope).settings;
  const existsInCurrentScope = settingExistsInScope(
    settingKey,
    currentScopeSettings,
  );

  return existsInCurrentScope
    ? t('settings.scope.alsoModifiedIn', {
        default: `(Also modified in ${modifiedScopesStr})`,
        scopes: modifiedScopesStr,
      })
    : t('settings.scope.modifiedIn', {
        default: `(Modified in ${modifiedScopesStr})`,
        scopes: modifiedScopesStr,
      });
}
