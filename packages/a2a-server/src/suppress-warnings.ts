#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This file must be imported first in the entry point to ensure the
// process.emitWarning override is in place before any other module is evaluated.
// In ESM, static imports are hoisted, so suppression logic placed inline in an
// entry file runs too late to catch warnings emitted during module loading.
//
// Suppresses DEP0040 (punycode deprecation) — the -S flag required to pass
// --no-warnings=DEP0040 via shebang is not supported on Windows.
const originalEmitWarning = process.emitWarning;
process.emitWarning = ((...args: unknown[]) => {
  const [, , code] = args;
  if (code === 'DEP0040') return;
  return Reflect.apply(originalEmitWarning, process, args);
}) as typeof process.emitWarning;
