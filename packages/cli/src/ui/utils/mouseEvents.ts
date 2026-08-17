/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type MouseEventsSetting = 'auto' | 'enabled' | 'disabled';

export function isTouchTerminalEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env['TERMUX_VERSION'] ||
      env['ANDROID_ROOT'] ||
      env['ANDROID_DATA'] ||
      env['PREFIX']?.includes('/com.termux'),
  );
}

export function shouldEnableMouseEvents(
  useAlternateBuffer: boolean,
  setting: MouseEventsSetting = 'auto',
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return useAlternateBuffer && shouldAllowMouseEvents(setting, env);
}

export function shouldAllowMouseEvents(
  setting: MouseEventsSetting = 'auto',
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (setting === 'disabled') {
    return false;
  }

  if (setting === 'enabled') {
    return true;
  }

  return !isTouchTerminalEnvironment(env);
}
