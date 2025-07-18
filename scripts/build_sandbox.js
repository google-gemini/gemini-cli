/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cliPkgJson from '../packages/cli/package.json' with { type: 'json' };

const argv = yargs(hideBin(process.argv))
  .option('s', {
    alias: 'skip-npm-install-build',
    type: 'boolean',
    default: false,
    description: 'skip npm install + npm run build',
  })
  .option('f', {
    alias: 'dockerfile',
    type: 'string',
    description: 'use <dockerfile> for custom image',
  })
  .option('i', {
    alias: 'image',
    type: 'string',
    description: 'use <image> name for custom image',
  })
  .option('output-file', {
    type: 'string',
    description:
      'Path to write the final image URI. Used for CI/CD pipeline integration.',
  }).argv;

let sandboxCommand;
try {
  sandboxCommand = execSync('node scripts/sandbox_command.js')
    .toString()
    .trim();
} catch {
  console.warn('ERROR: could not detect sandbox container command');
  process.exit(0);
}

if (sandboxCommand === 'sandbox-exec') {
  console.warn(
    'WARNING: container-based sandboxing is disabled (see README.md#sandboxing)',
  );
  process.exit(0);
}

console.log(`using ${sandboxCommand} for sandboxing`);

const baseImage = cliPkgJson.config.sandboxImageUri;
const customImage = argv.i;
const baseDockerfile = 'Dockerfile';
const customDockerfile = argv.f;

if (!baseImage?.length) {
  console.warn(
    'No default image tag specified in gemini-cli/packages/cli/package.json',
  );
}

if (!argv.s) {
  execSync('npm install', { stdio: 'inherit' });
  execSync('npm run build --workspaces', { stdio: 'inherit' });
}

console.log('packing @google/gemini-cli ...');
const cliPackageDir = join('packages', 'cli');
rmSync(join(cliPackageDir, 'dist', 'google-gemini-cli-*.tgz'), { force: true });
execSync(
  `npm pack -w @google/gemini-cli --pack-destination ./packages/cli/dist`,
  {
    stdio: 'ignore',
  },
);

console.log('packing @google/gemini-cli-core ...');
const corePackageDir = join('packages', 'core');
rmSync(join(corePackageDir, 'dist', 'google-gemini-cli-core-*.tgz'), {
  force: true,
});
execSync(
  `npm pack -w @google/gemini-cli-core --pack-destination ./packages/core/dist`,
  { stdio: 'ignore' },
);

const packageVersion = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
).version;

chmodSync(
  join(cliPackageDir, 'dist', `google-gemini-cli-${packageVersion}.tgz`),
  0o755,
);
chmodSync(
  join(corePackageDir, 'dist', `google-gemini-cli-core-${packageVersion}.tgz`),
  0o755,
);

const buildStdout = process.env.VERBOSE ? 'inherit' : 'ignore';

function buildImage(imageName, dockerfile) {
  console.log(`building ${imageName} ... (can be slow first time)`);
  const buildCommand =
    sandboxCommand === 'podman'
      ? `${sandboxCommand} build --authfile=<(echo '{}')`
      : `${sandboxCommand} build`;

  const npmPackageVersion = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
  ).version;

  const imageTag =
    process.env.GEMINI_SANDBOX_IMAGE_TAG || imageName.split(':')[1];
  const finalImageName = `${imageName.split(':')[0]}:${imageTag}`;

  execSync(
    `${buildCommand} ${
      process.env.BUILD_SANDBOX_FLAGS || ''
    } --build-arg CLI_VERSION_ARG=${npmPackageVersion} -f "${dockerfile}" -t "${finalImageName}" .`,
    { stdio: buildStdout, shell: '/bin/bash' },
  );
  console.log(`built ${finalImageName}`);

  // If an output file path was provided via command-line, write the final image URI to it.
  if (argv.outputFile) {
    console.log(
      `Writing final image URI for CI artifact to: ${argv.outputFile}`,
    );
    // The publish step only supports one image. If we build multiple, only the last one
    // will be published. Throw an error to make this failure explicit if the file already exists.
    if (existsSync(argv.outputFile)) {
      throw new Error(
        `CI artifact file ${argv.outputFile} already exists. Refusing to overwrite.`,
      );
    }
    writeFileSync(argv.outputFile, finalImageName);
  }
}

if (baseImage && baseDockerfile) {
  buildImage(baseImage, baseDockerfile);
}

if (customDockerfile && customImage) {
  buildImage(customImage, customDockerfile);
}

execSync(`${sandboxCommand} image prune -f`, { stdio: 'ignore' });
