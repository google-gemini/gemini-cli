/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SandboxConfig } from '@google/gemini-cli-core';
import commandExists from 'command-exists';
import * as os from 'node:os';
import { getPackageJson } from '../utils/package.js';
import { Settings } from './settings.js';

// This is a stripped-down version of the CliArgs interface from config.ts
// to avoid circular dependencies.
interface SandboxCliArgs {
  sandbox?: boolean | string;
  sandboxImage?: string;
}

const VALID_SANDBOX_COMMANDS: ReadonlyArray<SandboxConfig['command']> = [
  'docker',
  'podman',
  'sandbox-exec',
];

function isSandboxCommand(value: string): value is SandboxConfig['command'] {
  return (VALID_SANDBOX_COMMANDS as readonly string[]).includes(value);
}

function getSandboxCommand(
  sandbox?: boolean | string,
): SandboxConfig['command'] | '' {
  // If the SANDBOX env var is set, we're already inside the sandbox.
  if (process.env['SANDBOX']) {
    return '';
  }

  // note environment variable takes precedence over argument (from command line or settings)
  const environmentConfiguredSandbox =
    process.env['GEMINI_SANDBOX']?.toLowerCase().trim() ?? '';
  sandbox =
    environmentConfiguredSandbox?.length > 0
      ? environmentConfiguredSandbox
      : sandbox;
  if (sandbox === '1' || sandbox === 'true') sandbox = true;
  else if (sandbox === '0' || sandbox === 'false' || !sandbox) sandbox = false;

  if (sandbox === false) {
    return '';
  }

  if (typeof sandbox === 'string' && sandbox) {
    if (!isSandboxCommand(sandbox)) {
      console.error(
        `ERROR: invalid sandbox command '${sandbox}'. Must be one of ${VALID_SANDBOX_COMMANDS.join(
          ', ',
        )}`,
      );
      process.exit(1);
    }
    // confirm that specified command exists
    if (commandExists.sync(sandbox)) {
      return sandbox;
    }
    console.error(
      `ERROR: missing sandbox command '${sandbox}' (from GEMINI_SANDBOX)`,
    );
    process.exit(1);
  }

  // look for seatbelt, docker, or podman, in that order
  // for container-based sandboxing, require sandbox to be enabled explicitly
  if (os.platform() === 'darwin' && commandExists.sync('sandbox-exec')) {
    return 'sandbox-exec';
  } else if (commandExists.sync('docker') && sandbox === true) {
    return 'docker';
  } else if (commandExists.sync('podman') && sandbox === true) {
    return 'podman';
  }

  // throw an error if user requested sandbox but no command was found
  if (sandbox === true) {
    console.error(
      'ERROR: GEMINI_SANDBOX is true but failed to determine command for sandbox; ' +
        'install docker or podman or specify command in GEMINI_SANDBOX',
    );
    process.exit(1);
  }

  return '';
}

export async function loadSandboxConfig(
  settings: Settings,
  argv: SandboxCliArgs,
): Promise<SandboxConfig | undefined> {
  const sandboxOption = argv.sandbox ?? settings.sandbox;
  const command = getSandboxCommand(sandboxOption);

  const packageJson = await getPackageJson();
  const image =
    argv.sandboxImage ??
    process.env['GEMINI_SANDBOX_IMAGE'] ??
    packageJson?.config?.sandboxImageUri;

  return command && image ? { command, image } : undefined;
}
