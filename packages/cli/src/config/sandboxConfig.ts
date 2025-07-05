/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SandboxConfig, SUPPORTED_SANDBOX_COMMANDS } from '@google/gemini-cli-core';
import commandExists from 'command-exists';
import { platform } from 'node:os';
import { getPackageJson } from '../utils/package.js';
import { Settings } from './settings.js';

// This is a stripped-down version of the CliArgs interface from config.ts
// to avoid circular dependencies.
interface SandboxCliArgs {
  sandbox?: SandboxOption;
  'sandbox-image'?: string;
}

export const SANDBOX_LEGACY_OPTIONS = ['0', 'false', '1', 'true'] as const; // kept for backwards compatibility
export type SandboxLegacyOption =
  typeof SANDBOX_LEGACY_OPTIONS extends ReadonlyArray<infer T> ? T : never;

export const SANDBOX_OPTIONS = [
  // TODO: phase out '0', '1', 'false', and 'true' entirely
  ...SANDBOX_LEGACY_OPTIONS,
  'auto',
  'none',
  ...SUPPORTED_SANDBOX_COMMANDS,
] as const;
export type SandboxOption =
  typeof SANDBOX_OPTIONS extends ReadonlyArray<infer T> ? T : never;
function isValidSandboxOption(str: string): str is SandboxOption {
  return !!SANDBOX_OPTIONS.find((s) => s === str);
}

function getSandboxCommand(
  sandbox: SandboxOption,
): SandboxConfig['command'] | undefined {
  switch (sandbox) {
    case 'none':
    case '0':
    case 'false':
      return undefined;
    case 'docker':
    case 'podman':
    case 'sandbox-exec':
      if (!commandExists.sync(sandbox)) {
        throw new Error(
          `provided sandbox command '${sandbox}' was not found on the device`,
        );
      }
      return sandbox;
    case 'auto':
    case '1':
    case 'true': {
      // look for seatbelt, docker, or podman, in that order
      // for container-based sandboxing, require sandbox to be enabled explicitly
      if (platform() === 'darwin' && commandExists.sync('sandbox-exec')) {
        return 'sandbox-exec';
      } else if (commandExists.sync('docker')) {
        return 'docker';
      } else if (commandExists.sync('podman')) {
        return 'podman';
      }
      throw new Error(
        `Unable to automatically detect the sandbox container command. Options include ${SUPPORTED_SANDBOX_COMMANDS};
          install docker or podman or specify command with --sandbox CLI arg, GEMINI_SANDBOX env var, or .gemini/settings.json`,
      );
    }
    default: {
      // throws transpiler error if all cases aren't considered
      const exhaustiveCheck: never = sandbox;
      return exhaustiveCheck;
    }
  }
}

// defines order of precedence for sandbox selection
function pickSandboxOption(
  settings: Settings,
  argv: SandboxCliArgs,
): string | undefined {
  if (argv.sandbox) {
    console.log(`Using sandbox value from --sandbox '${argv.sandbox}'.`);
    return argv.sandbox;
  }
  // warn if we detect any unsupported settings/envvar values
  if (settings.sandbox) {
    console.log(
      `Using sandbox field in .gemini/settings.json '${settings.sandbox}'.`,
    );
    return settings.sandbox;
  }
  if (process.env.GEMINI_SANDBOX) {
    console.log(
      `Using sandbox value from 'GEMINI_SANDBOX' env var '${process.env.GEMINI_SANDBOX}'.`,
    );
    return process.env.GEMINI_SANDBOX;
  }
  return undefined;
}

export async function loadSandboxConfig(
  settings: Settings,
  argv: SandboxCliArgs,
): Promise<SandboxConfig | undefined> {
  // If the SANDBOX env var is set, we're already inside the sandbox.
  if (process.env.SANDBOX) {
    return undefined;
  }

  // coallesce all provided options
  const sandboxOption = pickSandboxOption(settings, argv);
  if (!sandboxOption) {
    return undefined;
  }
  if (!isValidSandboxOption(sandboxOption)) {
    throw new Error(
      `invalid sandbox command '${sandboxOption}'. Must be one of ${SANDBOX_OPTIONS}`,
    );
  }

  const command = getSandboxCommand(sandboxOption);

  const packageJson = await getPackageJson();
  const image =
    argv['sandbox-image'] ??
    process.env.GEMINI_SANDBOX_IMAGE ??
    packageJson?.config?.sandboxImageUri;

  return command && image ? { command, image } : undefined;
}
