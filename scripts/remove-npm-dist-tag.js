/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Removes an npm dist-tag with retries.
 *
 * Wombat/npm can acknowledge `npm publish` before dist-tags are queryable
 * ("Your package is being processed and may take a few minutes to become
 * available."). Immediate `npm dist-tag rm` then fails with
 * "<tag> is not a dist-tag on <package>".
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const NOT_A_DIST_TAG_RE = /is not a dist-tag/i;

function sleep(ms) {
  // Sync sleep so this helper stays callable from CI shell steps without top-level await.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeDistTag(packageName, tag) {
  execFileSync('npm', ['dist-tag', 'rm', packageName, tag], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function removeNpmDistTag({
  packageName,
  tag,
  maxAttempts = 20,
  retryDelayMs = 15_000,
} = {}) {
  if (!packageName) {
    throw new Error('packageName is required');
  }
  if (!tag) {
    throw new Error('tag is required');
  }

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      removeDistTag(packageName, tag);
      console.log(`Removed dist-tag "${tag}" from ${packageName}`);
      return;
    } catch (error) {
      lastError = error;
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`;
      console.error(output.trim());

      if (!NOT_A_DIST_TAG_RE.test(output)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        break;
      }

      console.error(
        `dist-tag "${tag}" not yet available on ${packageName} ` +
          `(attempt ${attempt}/${maxAttempts}); retrying in ${retryDelayMs / 1000}s...`,
      );
      sleep(retryDelayMs);
    }
  }

  throw new Error(
    `Failed to remove dist-tag "${tag}" from ${packageName} after ${maxAttempts} attempts: ${lastError?.message ?? lastError}`,
  );
}

function getArgs(argv = hideBin(process.argv)) {
  return yargs(argv)
    .option('package', {
      description: 'npm package name (e.g. @google/gemini-cli-core)',
      type: 'string',
      demandOption: true,
    })
    .option('tag', {
      description: 'dist-tag to remove',
      type: 'string',
      demandOption: true,
    })
    .option('max-attempts', {
      description: 'Maximum number of removal attempts',
      type: 'number',
      default: 20,
    })
    .option('retry-delay-ms', {
      description: 'Delay between retries in milliseconds',
      type: 'number',
      default: 15_000,
    })
    .help(false)
    .version(false)
    .parse();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = getArgs();
  removeNpmDistTag({
    packageName: args.package,
    tag: args.tag,
    maxAttempts: args['max-attempts'],
    retryDelayMs: args['retry-delay-ms'],
  });
}
