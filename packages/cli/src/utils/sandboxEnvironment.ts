/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function normalizeSandboxEnv(
  sandboxEnv: string | undefined,
): string | undefined {
  const normalized = sandboxEnv?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function getSandboxEnv(): string | undefined {
  const sandboxEnv = process.env['SANDBOX']?.trim();
  return sandboxEnv && sandboxEnv.length > 0 ? sandboxEnv : undefined;
}

export function isInsideSandboxEnvironment(
  sandboxEnv: string | undefined = getSandboxEnv(),
): boolean {
  const normalized = normalizeSandboxEnv(sandboxEnv);
  return !!normalized && normalized !== '0' && normalized !== 'false';
}

export function isMacOsSeatbeltSandbox(
  sandboxEnv: string | undefined = getSandboxEnv(),
): boolean {
  return normalizeSandboxEnv(sandboxEnv) === 'sandbox-exec';
}
