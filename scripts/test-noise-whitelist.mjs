// scripts/test-noise-whitelist.mjs
// Whitelist helper for audit-test-noise.mjs (refs #23474, issue #23328)
//
// Usage inside audit-test-noise.mjs:
//   import { isAllowedNoise } from './test-noise-whitelist.mjs';
//   const realNoise = capturedLines.filter(l => !isAllowedNoise(l));

/**
 * Patterns for test output that is expected/harmless.
 * Each entry has a `pattern` (RegExp) and a `reason` (string).
 */
export const ALLOWED_NOISE_PATTERNS = [
  {
    pattern: /Warning: An update to .+ inside a test was not wrapped in act/,
    reason: 'React act() warning — expected in async ink/React component tests',
  },
  {
    pattern: /UnhandledPromiseRejection/i,
    reason: 'Vitest intentional rejection tests using expect.assertions()',
  },
  {
    pattern: /Error: connect ECONNREFUSED/,
    reason: 'Expected network error in offline / unavailable-API unit tests',
  },
  {
    pattern: /console\.(warn|error).*\[vitest\]/,
    reason: 'Vitest-internal diagnostics — not emitted by production code',
  },
];

/**
 * Returns true if `line` matches a known-harmless noise pattern.
 * Pass as a filter to skip whitelisted lines in the audit script.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isAllowedNoise(line) {
  return ALLOWED_NOISE_PATTERNS.some(({ pattern }) => pattern.test(line));
}
