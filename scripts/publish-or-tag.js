/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

export function publishOrTag(packageName, version, tag, dryRun) {
  if (!packageName || !version || !tag) {
    console.error(
      'Usage: node scripts/publish-or-tag.js <package-name> <version> <tag> [--dry-run]',
    );
    process.exit(1);
  }

  try {
    const versions = JSON.parse(
      execSync(`npm view ${packageName} versions --json`).toString(),
    );
    if (versions.includes(version)) {
      console.log(
        `Version ${version} of ${packageName} already exists. Updating tag ${tag}.`,
      );
      if (!dryRun) {
        execSync(`npm dist-tag add ${packageName}@${version} ${tag}`);
      } else {
        console.log(
          `Dry run: would have run 'npm dist-tag add ${packageName}@${version} ${tag}'`,
        );
      }
    } else {
      console.log(
        `Version ${version} of ${packageName} does not exist. Publishing.`,
      );
      const dryRunFlag = dryRun ? '--dry-run' : '';
      try {
        execSync(
          `npm publish --workspace=${packageName} --tag=${tag} ${dryRunFlag}`,
        );
      } catch (error) {
        // npm publish throws an error if the version already exists, even with --force.
        // This can happen in a race condition where another process publishes the same version.
        // If the version exists, we can safely ignore the error and update the tag.
        const versions = JSON.parse(
          execSync(`npm view ${packageName} versions --json`).toString(),
        );
        if (versions.includes(version)) {
          console.log(
            `Version ${version} of ${packageName} was published by another process. Updating tag ${tag}.`,
          );
          if (!dryRun) {
            execSync(`npm dist-tag add ${packageName}@${version} ${tag}`);
          } else {
            console.log(
              `Dry run: would have run 'npm dist-tag add ${packageName}@${version} ${tag}'`,
            );
          }
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(
      'Error checking package version or publishing:',
      error.message,
    );
    process.exit(1);
  }
}

if (process.argv[1].endsWith('publish-or-tag.js')) {
  const packageName = process.argv[2];
  const version = process.argv[3];
  const tag = process.argv[4];
  const dryRun = process.argv[5] === 'true';
  publishOrTag(packageName, version, tag, dryRun);
}
