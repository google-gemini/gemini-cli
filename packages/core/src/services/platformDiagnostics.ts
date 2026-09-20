/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import {
  checkCpuCompatibility,
  type CpuCompatibilityResult,
} from './cpuCompatibility.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface PlatformDiagnosticsReport {
  timestamp: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  osRelease: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGb: string;
  cpuCompatibility: CpuCompatibilityResult;
  antigravityReady: boolean;
}

/**
 * Cached compatibility result to avoid redundant /proc/cpuinfo reads or
 * sysctl invocations within the same process lifetime.
 */
let cachedCompatibility: CpuCompatibilityResult | null = null;

/**
 * Returns the cached CPU compatibility result, running the detection
 * only once per process. This is safe because CPU features obviously
 * don't change at runtime.
 */
export function getCachedCpuCompatibility(): CpuCompatibilityResult {
  if (!cachedCompatibility) {
    cachedCompatibility = checkCpuCompatibility();
    debugLogger.debug(
      `CPU compatibility check: ${cachedCompatibility.compatible ? 'PASS' : 'FAIL'} ` +
        `(${cachedCompatibility.cpuModel}, ${cachedCompatibility.microarchLevel})`,
    );
  }
  return cachedCompatibility;
}

/**
 * Clear the cached compatibility result. Exposed only for testing.
 */
export function _resetCachedCompatibilityForTest(): void {
  cachedCompatibility = null;
}

/**
 * Build a full platform diagnostics report combining OS, hardware, and
 * Antigravity compatibility information.
 */
export function buildPlatformDiagnostics(): PlatformDiagnosticsReport {
  const cpuCompat = getCachedCpuCompatibility();
  const cpus = os.cpus();

  return {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    osRelease: os.release(),
    cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
    cpuCores: os.availableParallelism(),
    totalMemoryGb: (os.totalmem() / 1024 ** 3).toFixed(2),
    cpuCompatibility: cpuCompat,
    antigravityReady: cpuCompat.compatible,
  };
}

/**
 * Format the diagnostics report as a human-readable string suitable
 * for inclusion in bug reports or /stats output.
 */
export function formatDiagnosticsReport(
  report: PlatformDiagnosticsReport,
): string {
  const lines: string[] = [
    `Platform: ${report.platform} (${report.arch})`,
    `OS Release: ${report.osRelease}`,
    `Node.js: ${report.nodeVersion}`,
    `CPU: ${report.cpuModel}`,
    `CPU Cores: ${report.cpuCores}`,
    `Total Memory: ${report.totalMemoryGb} GB`,
    `CPU Microarch Level: ${report.cpuCompatibility.microarchLevel}`,
    `CPU Features: SSE4.2=${report.cpuCompatibility.features.sse42}, ` +
      `AVX=${report.cpuCompatibility.features.avx}, ` +
      `AVX2=${report.cpuCompatibility.features.avx2}, ` +
      `AES-NI=${report.cpuCompatibility.features.aesni}`,
    `Antigravity Compatible: ${report.antigravityReady ? 'Yes' : 'No'}`,
  ];

  if (!report.antigravityReady) {
    lines.push(
      `Missing Features: ${report.cpuCompatibility.missingFeatures.join(', ')}`,
    );
  }

  return lines.join('\n');
}
