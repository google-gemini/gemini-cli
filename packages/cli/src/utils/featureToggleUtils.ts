/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SettingScope,
  isLoadableSettingScope,
  type LoadableSettingScope,
  type LoadedSettings,
} from '../config/settings.js';

export interface ModifiedScope {
  scope: SettingScope;
  path: string;
}

export type FeatureActionStatus = 'success' | 'no-op' | 'error';

export interface FeatureActionResult {
  status: FeatureActionStatus;
  featureName: string;
  action: 'enable' | 'disable';
  /** Scopes where the feature's state was actually changed. */
  modifiedScopes: ModifiedScope[];
  /** Scopes where the feature was already in the desired state. */
  alreadyInStateScopes: ModifiedScope[];
  /** Error message if status is 'error'. */
  error?: string;
}

/**
 * Strategy pattern to handle differences between feature types (e.g. skills vs agents).
 */
export interface FeatureToggleStrategy {
  /**
   * Checks if the feature needs to be enabled in the given scope.
   * For skills (blacklist): returns true if in disabled list.
   * For agents (whitelist): returns true if NOT explicitly enabled (false or undefined).
   */
  needsEnabling(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): boolean;

  /**
   * Applies the enable change to the settings object.
   */
  enable(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): void;

  /**
   * Checks if the feature is explicitly disabled in the given scope.
   * For skills (blacklist): returns true if in disabled list.
   * For agents (whitelist): returns true if explicitly set to false.
   */
  isExplicitlyDisabled(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): boolean;

  /**
   * Applies the disable change to the settings object.
   */
  disable(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): void;
}

/**
 * Enables a feature by ensuring it is enabled in all writable scopes.
 */
export function enableFeature(
  settings: LoadedSettings,
  featureName: string,
  strategy: FeatureToggleStrategy,
): FeatureActionResult {
  const writableScopes = [SettingScope.Workspace, SettingScope.User];
  const foundInDisabledScopes: ModifiedScope[] = [];
  const alreadyEnabledScopes: ModifiedScope[] = [];

  for (const scope of writableScopes) {
    if (isLoadableSettingScope(scope)) {
      const scopePath = settings.forScope(scope).path;
      if (strategy.needsEnabling(settings, scope, featureName)) {
        foundInDisabledScopes.push({ scope, path: scopePath });
      } else {
        alreadyEnabledScopes.push({ scope, path: scopePath });
      }
    }
  }

  if (foundInDisabledScopes.length === 0) {
    return {
      status: 'no-op',
      featureName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: alreadyEnabledScopes,
    };
  }

  const modifiedScopes: ModifiedScope[] = [];
  for (const { scope, path } of foundInDisabledScopes) {
    if (isLoadableSettingScope(scope)) {
      strategy.enable(settings, scope, featureName);
      modifiedScopes.push({ scope, path });
    }
  }

  return {
    status: 'success',
    featureName,
    action: 'enable',
    modifiedScopes,
    alreadyInStateScopes: alreadyEnabledScopes,
  };
}

/**
 * Disables a feature in the specified scope.
 */
export function disableFeature(
  settings: LoadedSettings,
  featureName: string,
  scope: SettingScope,
  strategy: FeatureToggleStrategy,
): FeatureActionResult {
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      featureName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopePath = settings.forScope(scope).path;

  if (strategy.isExplicitlyDisabled(settings, scope, featureName)) {
    return {
      status: 'no-op',
      featureName,
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
    if (strategy.isExplicitlyDisabled(settings, otherScope, featureName)) {
      alreadyDisabledInOther.push({
        scope: otherScope,
        path: settings.forScope(otherScope).path,
      });
    }
  }

  strategy.disable(settings, scope, featureName);

  return {
    status: 'success',
    featureName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: alreadyDisabledInOther,
  };
}
