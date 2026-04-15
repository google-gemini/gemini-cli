/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function isVerboseLogLevel(value) {
  return value === 'verbose' || value === 'silly';
}

export function resolveVitestModes(args, env = process.env) {
  const verboseMode =
    args.includes('--verbose') || isVerboseLogLevel(env['npm_config_loglevel']);
  const auditMode = args.includes('--audit-output');
  const forwardedArgs = args.filter(
    (arg) => arg !== '--verbose' && arg !== '--audit-output',
  );

  return {
    verboseMode,
    auditMode,
    forwardedArgs,
  };
}
