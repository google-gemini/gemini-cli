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
const originalEmitWarning = process.emitWarning.bind(process);
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
process.emitWarning = ((
  warning: string | Error,
  options?: string | NodeJS.EmitWarningOptions,
) => {
  const code =
    typeof options === 'object' && options !== null
      ? options.code
      : typeof options === 'string'
        ? options
        : undefined;
  if (code === 'DEP0040') return;
  if (typeof options === 'string') {
    return originalEmitWarning(warning, { code: options });
  }
  return originalEmitWarning(warning, options);
}) as typeof process.emitWarning;
