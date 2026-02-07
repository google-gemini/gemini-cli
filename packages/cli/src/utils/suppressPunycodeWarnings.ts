/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Suppress punycode deprecation warning (DEP0040)
// This is required because several dependencies (e.g., node-fetch -> tr46) still use the deprecated punycode module.
// We monkey patch process.emitWarning because it's called during module evaluation, often before a standard 'warning' listener can be registered.

const originalEmitWarning = process.emitWarning;
type EmitWarningParameters = Parameters<typeof process.emitWarning>;

process.emitWarning = function (...args: EmitWarningParameters) {
  // We check all arguments because the identifying code ('DEP0040') can be passed
  // positionally (as the 3rd argument) or inside an options object (as the 2nd argument)
  // depending on which process.emitWarning overload is called.
  if (args.some(isPunycodeWarning)) return;

  return originalEmitWarning.apply(process, args);
} as typeof process.emitWarning;

function isPunycodeWarning(warning: unknown): boolean {
  if (typeof warning === 'string') {
    return warning.includes('punycode') || warning === 'DEP0040';
  }
  if (warning !== null && typeof warning === 'object') {
    return 'code' in warning && warning.code === 'DEP0040';
  }
  return false;
}
