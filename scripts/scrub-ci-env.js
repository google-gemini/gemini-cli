/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keys that `is-in-ci` (v2) checks to determine if the process is running in a
 * CI environment.  When either key is present and truthy, `ink` switches to
 * non-interactive mode, which breaks the dev server (`npm run start`).
 *
 * The bundled build patches `is-in-ci` at esbuild time (see
 * esbuild.config.js), but the dev server bypasses esbuild and runs TypeScript
 * directly, so we need to strip these vars from the child-process environment.
 *
 * See https://github.com/google-gemini/gemini-cli/issues/22452
 */
const CI_ENV_KEYS = ['CI', 'CONTINUOUS_INTEGRATION'];

/**
 * Removes CI-related env vars from `env` **in place** so that `is-in-ci`
 * returns `false` and `ink` stays in interactive mode.
 *
 * `is-in-ci` checks key existence (`'CI' in env`), so even `'0'` and `'false'`
 * values trigger CI detection in Node.js (where all env values are strings and
 * therefore truthy).  We always delete the key, but only report it in the
 * returned array when the original value was meaningful — callers use the list
 * to decide whether to show a warning, and `'0'`/`'false'` clearly signal
 * intent to disable CI.
 *
 * @param {Record<string, string | undefined>} env  The environment object
 *   (typically a spread of `process.env`).
 * @returns {string[]}  The keys that were removed with meaningful values.
 */
export function scrubCiEnv(env) {
  const scrubbed = [];
  for (const key of CI_ENV_KEYS) {
    if (key in env) {
      const value = env[key];
      if (value !== '0' && value !== 'false') {
        scrubbed.push(key);
      }
      delete env[key];
    }
  }
  return scrubbed;
}
