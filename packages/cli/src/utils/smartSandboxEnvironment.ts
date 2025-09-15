/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';
import { getSecureSandboxEnvironment, sanitizeSandboxEnvironment } from '../sandbox/security.js';

export interface SmartSandboxOptions {
  settings: LoadedSettings;
  projectRoot: string;
  command?: string;
}

export interface SmartSandboxConfig {
  env: Record<string, string>;
  mountMode: 'ro' | 'rw';
  networkMode: 'none' | 'local' | 'full';
  cpuShares?: number;
  memory?: string; // e.g., '512m'
  tmpfs?: boolean;
}

/**
 * Produces a compact, predictable sandbox configuration tuned for CLI throughput.
 */
export function createSmartSandboxConfig(opts: SmartSandboxOptions): SmartSandboxConfig {
  const { settings } = opts;

  // Start from a minimal, cache-friendly environment
  const baseEnv = getSecureSandboxEnvironment();
  const mergedEnv: Record<string, string | undefined> = { ...process.env, ...baseEnv };
  const env = sanitizeSandboxEnvironment(mergedEnv);

  // Lean defaults prioritize fast startup; can be relaxed via settings if needed
  const mountMode: 'ro' | 'rw' = 'ro';
  const tmpfs = true;

  // Keep IO chatter low by default; expand when explicitly configured
  const networkMode: 'none' | 'local' | 'full' = (settings.merged.tools?.sandbox as any)?.networkMode ?? 'local';

  // Conservative resource hints to keep latency tight
  const cpuShares = 256; // relative weight
  const memory = '512m';

  return { env, mountMode, networkMode, cpuShares, memory, tmpfs };
}

