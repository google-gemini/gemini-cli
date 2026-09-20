/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * CPU instruction set feature flags relevant to Antigravity CLI binary
 * compatibility. The Go-based Antigravity binary is compiled with GOAMD64=v3
 * by default, which requires AVX/AVX2 and SSE4.2 support. Legacy CPUs
 * (e.g. AMD A-Series/Llano, Intel Core 2 Duo) lack these instructions and
 * will crash with SIGILL (Illegal instruction, exit code 132).
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/27342
 */
export interface CpuFeatureFlags {
  sse42: boolean;
  avx: boolean;
  avx2: boolean;
  aesni: boolean;
}

export interface CpuCompatibilityResult {
  compatible: boolean;
  cpuModel: string;
  arch: string;
  microarchLevel:
    | 'x86-64-v1'
    | 'x86-64-v2'
    | 'x86-64-v3'
    | 'x86-64-v4'
    | 'non-x86'
    | 'unknown';
  features: CpuFeatureFlags;
  missingFeatures: string[];
}

/**
 * Minimum required CPU microarchitecture level for the Antigravity CLI.
 * GOAMD64=v3 requires AVX, AVX2, and SSE4.2.
 */
const REQUIRED_LEVEL = 'x86-64-v3';

const REQUIRED_FEATURES: Array<keyof CpuFeatureFlags> = ['sse42', 'avx', 'avx2'];

/**
 * Detect CPU feature flags by reading /proc/cpuinfo on Linux, or by
 * invoking sysctl on macOS. On Windows, we use a conservative heuristic
 * based on the CPU model string from os.cpus().
 */
export function detectCpuFeatures(): CpuFeatureFlags {
  const defaultFlags: CpuFeatureFlags = {
    sse42: false,
    avx: false,
    avx2: false,
    aesni: false,
  };

  try {
    if (process.platform === 'linux') {
      return detectCpuFeaturesLinux();
    } else if (process.platform === 'darwin') {
      return detectCpuFeaturesDarwin();
    } else if (process.platform === 'win32') {
      return detectCpuFeaturesWindows();
    }
  } catch (error) {
    debugLogger.debug(
      `Failed to detect CPU features: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return defaultFlags;
}

/**
 * Parse /proc/cpuinfo flags line on Linux.
 */
function detectCpuFeaturesLinux(): CpuFeatureFlags {
  const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
  const flagsLine = cpuinfo
    .split('\n')
    .find((line) => line.startsWith('flags'));

  if (!flagsLine) {
    return { sse42: false, avx: false, avx2: false, aesni: false };
  }

  const flags = flagsLine.toLowerCase();

  return {
    sse42: flags.includes('sse4_2'),
    avx: /\bavx\b/.test(flags),
    avx2: flags.includes('avx2'),
    aesni: flags.includes('aes'),
  };
}

/**
 * Query sysctl for CPU feature support on macOS.
 */
function detectCpuFeaturesDarwin(): CpuFeatureFlags {
  const query = (key: string): boolean => {
    try {
      const output = execFileSync('sysctl', ['-n', key], {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      return output === '1';
    } catch {
      return false;
    }
  };

  return {
    sse42: query('hw.optional.sse4_2'),
    avx: query('hw.optional.avx1_0'),
    avx2: query('hw.optional.avx2_0'),
    aesni: query('hw.optional.aes'),
  };
}

/**
 * On Windows, fall back to a heuristic based on the CPU model string
 * since there's no simple built-in way to query CPUID flags from JS.
 * CPUs from ~2013 onward (Haswell/Excavator and later) generally have
 * AVX2 support.
 */
function detectCpuFeaturesWindows(): CpuFeatureFlags {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) {
    return { sse42: false, avx: false, avx2: false, aesni: false };
  }

  const model = cpus[0].model.toLowerCase();

  // Known legacy CPU families that lack AVX support
  const legacyCpuPatterns = [
    /amd.*a[46]-/i, // AMD A-Series (Llano/Trinity, pre-AVX2)
    /amd.*athlon.*ii/i, // AMD Athlon II
    /amd.*phenom/i, // AMD Phenom
    /amd.*sempron/i, // AMD Sempron
    /intel.*core.*2 +(duo|quad)/i, // Intel Core 2 Duo/Quad (not i7-12xxx)
    /intel.*atom.*n\d/i, // Early Intel Atom (Bonnell/Saltwell)
    /intel.*celeron.*[gn]\d/i, // Early Celeron
    /intel.*pentium.*[gn]\d/i, // Early Pentium
  ];

  const isLegacy = legacyCpuPatterns.some((pattern) => pattern.test(model));

  if (isLegacy) {
    return { sse42: true, avx: false, avx2: false, aesni: false };
  }

  // Default assumption for modern CPUs
  return { sse42: true, avx: true, avx2: true, aesni: true };
}

/**
 * Determine the x86-64 microarchitecture level for the current CPU.
 */
export function getMicroarchLevel(
  features: CpuFeatureFlags,
): CpuCompatibilityResult['microarchLevel'] {
  const arch = process.arch;

  if (arch !== 'x64' && arch !== 'ia32') {
    return 'non-x86';
  }

  if (features.avx && features.avx2) {
    return 'x86-64-v3';
  }
  if (features.sse42) {
    return 'x86-64-v2';
  }
  if (!features.sse42 && !features.avx) {
    return 'x86-64-v1';
  }

  return 'unknown';
}

/**
 * Check whether the current CPU meets the minimum requirements for the
 * Antigravity CLI binary. Returns a detailed result including the
 * detected features and the missing ones.
 */
export function checkCpuCompatibility(): CpuCompatibilityResult {
  const cpus = os.cpus();
  const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : 'Unknown';
  const arch = process.arch;
  const features = detectCpuFeatures();
  const microarchLevel = getMicroarchLevel(features);

  const missingFeatures: string[] = [];
  for (const feature of REQUIRED_FEATURES) {
    if (!features[feature]) {
      missingFeatures.push(feature.toUpperCase());
    }
  }

  // Non-x86 architectures (ARM, etc.) are always considered compatible
  // because Antigravity provides separate binaries for those platforms.
  const isNonX86 = arch !== 'x64' && arch !== 'ia32';
  const compatible = isNonX86 || missingFeatures.length === 0;

  return {
    compatible,
    cpuModel,
    arch,
    microarchLevel,
    features,
    missingFeatures,
  };
}

/**
 * Generate a user-facing warning message for incompatible CPUs.
 */
export function getIncompatibilityWarning(
  result: CpuCompatibilityResult,
): string {
  if (result.compatible) {
    return '';
  }

  const lines = [
    `⚠ Hardware Compatibility Warning:`,
    `Your CPU (${result.cpuModel}) does not support the instruction sets`,
    `required by the Antigravity CLI binary (requires ${REQUIRED_LEVEL}).`,
    `Missing: ${result.missingFeatures.join(', ')}.`,
    `Detected microarchitecture level: ${result.microarchLevel}.`,
    ``,
    `The Antigravity CLI will fail with "Illegal instruction"`,
    `(SIGILL, exit code 132) on this hardware.`,
    `You can continue using Gemini CLI (Node.js) on this machine`,
    `until a baseline x86-64-v1 build is available.`,
    ``,
    `See: https://github.com/google-gemini/gemini-cli/issues/27342`,
  ];

  return lines.join('\n');
}

export { REQUIRED_FEATURES, REQUIRED_LEVEL };
