/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawnSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { quote } from 'shell-quote';
import { readPackageUp } from 'read-package-up';
import commandExists from 'command-exists';
import {
  USER_SETTINGS_DIR,
  SETTINGS_DIRECTORY_NAME,
} from '../config/settings.js';

function getContainerPath(hostPath: string): string {
  if (os.platform() !== 'win32') {
    return hostPath;
  }
  const withForwardSlashes = hostPath.replace(/\\/g, '/');
  const match = withForwardSlashes.match(/^([A-Z]):\/(.*)/i);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return hostPath;
}

const LOCAL_DEV_SANDBOX_IMAGE_NAME = 'gemini-cli-sandbox';

/**
 * Determines whether the sandbox container should be run with the current user's UID and GID.
 * This is often necessary on Linux systems (especially Debian/Ubuntu based) when using
 * rootful Docker without userns-remap configured, to avoid permission issues with
 * mounted volumes.
 *
 * The behavior is controlled by the `SANDBOX_SET_UID_GID` environment variable:
 * - If `SANDBOX_SET_UID_GID` is "1" or "true", this function returns `true`.
 * - If `SANDBOX_SET_UID_GID` is "0" or "false", this function returns `false`.
 * - If `SANDBOX_SET_UID_GID` is not set:
 *   - On Debian/Ubuntu Linux, it defaults to `true`.
 *   - On other OSes, or if OS detection fails, it defaults to `false`.
 *
 * For more context on running Docker containers as non-root, see:
 * https://medium.com/redbubble/running-a-docker-container-as-a-non-root-user-7d2e00f8ee15
 *
 * @returns {Promise<boolean>} A promise that resolves to true if the current user's UID/GID should be used, false otherwise.
 */
async function shouldUseCurrentUserInSandbox(): Promise<boolean> {
  const envVar = process.env.SANDBOX_SET_UID_GID?.toLowerCase().trim();

  if (envVar === '1' || envVar === 'true') {
    return true;
  }
  if (envVar === '0' || envVar === 'false') {
    return false;
  }

  // If environment variable is not explicitly set, check for Debian/Ubuntu Linux
  if (os.platform() === 'linux') {
    try {
      const osReleaseContent = await readFile('/etc/os-release', 'utf8');
      if (
        osReleaseContent.includes('ID=debian') ||
        osReleaseContent.includes('ID=ubuntu') ||
        osReleaseContent.match(/^ID_LIKE=.*debian.*/m) || // Covers derivatives
        osReleaseContent.match(/^ID_LIKE=.*ubuntu.*/m) // Covers derivatives
      ) {
        // note here and below we use console.error for informational messages on stderr
        console.error(
          'INFO: Defaulting to use current user UID/GID for Debian/Ubuntu-based Linux.',
        );
        return true;
      }
    } catch (_err) {
      // Silently ignore if /etc/os-release is not found or unreadable.
      // The default (false) will be applied in this case.
      console.warn(
        'Warning: Could not read /etc/os-release to auto-detect Debian/Ubuntu for UID/GID default.',
      );
    }
  }
  return false; // Default to false if no other condition is met
}

async function getSandboxImageName(
  isCustomProjectSandbox: boolean,
): Promise<string> {
  const packageJsonResult = await readPackageUp();
  const packageJsonConfig = packageJsonResult?.packageJson.config as
    | { sandboxImageUri?: string }
    | undefined;
  return (
    process.env.GEMINI_SANDBOX_IMAGE ??
    packageJsonConfig?.sandboxImageUri ??
    (isCustomProjectSandbox
      ? LOCAL_DEV_SANDBOX_IMAGE_NAME + '-' + path.basename(path.resolve())
      : LOCAL_DEV_SANDBOX_IMAGE_NAME)
  );
}

// node.js equivalent of scripts/sandbox_command.sh
export function sandbox_command(sandbox?: string | boolean): string {
  // note environment variable takes precedence over argument (from command line or settings)
  sandbox = process.env.GEMINI_SANDBOX?.toLowerCase().trim() ?? sandbox;
  if (sandbox === '1' || sandbox === 'true') sandbox = true;
  else if (sandbox === '0' || sandbox === 'false') sandbox = false;

  if (sandbox === true) {
    // look for docker or podman, in that order
    if (commandExists.sync('docker')) {
      return 'docker'; // Set sandbox to 'docker' if found
    } else if (commandExists.sync('podman')) {
      return 'podman'; // Set sandbox to 'podman' if found
    } else {
      console.error(
        'ERROR: failed to determine command for sandbox; ' +
          'install docker or podman or specify command in GEMINI_SANDBOX',
      );
      process.exit(1);
    }
  } else if (sandbox) {
    // confirm that specfied command exists
    if (commandExists.sync(sandbox)) {
      return sandbox;
    } else {
      console.error(
        `ERROR: missing sandbox command '${sandbox}' (from GEMINI_SANDBOX)`,
      );
      process.exit(1);
    }
  } else {
    // if we are on macOS (Darwin) and sandbox-exec is available, use that for minimal sandboxing
    // unless SEATBELT_PROFILE is set to 'none', which we allow as an escape hatch
    if (
      os.platform() === 'darwin' &&
      commandExists.sync('sandbox-exec') &&
      process.env.SEATBELT_PROFILE !== 'none'
    ) {
      return 'sandbox-exec';
    }

    return ''; // no sandbox
  }
}

// docker does not allow container names to contain ':' or '/', so we
// parse those out and make the name a little shorter
function parseImageName(image: string): string {
  const [fullName, tag] = image.split(':');
  const name = fullName.split('/').at(-1) ?? 'unknown-image';
  return tag ? `${name}-${tag}` : name;
}

function ports(): string[] {
  return (process.env.SANDBOX_PORTS ?? '')
    .split(',')
    .filter((p) => p.trim())
    .map((p) => p.trim());
}

function entrypoint(workdir: string): string[] {
  const isWindows = os.platform() === 'win32';
  const containerWorkdir = getContainerPath(workdir);
  const shellCmds = [];
  const pathSeparator = isWindows ? ';' : ':';

  let pathSuffix = '';
  if (process.env.PATH) {
    const paths = process.env.PATH.split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pathSuffix) {
    shellCmds.push(`export PATH="$PATH${pathSuffix}";`);
  }

  let pythonPathSuffix = '';
  if (process.env.PYTHONPATH) {
    const paths = process.env.PYTHONPATH.split(pathSeparator);
    for (const p of paths) {
      const containerPath = getContainerPath(p);
      if (
        containerPath.toLowerCase().startsWith(containerWorkdir.toLowerCase())
      ) {
        pythonPathSuffix += `:${containerPath}`;
      }
    }
  }
  if (pythonPathSuffix) {
    shellCmds.push(`export PYTHONPATH="$PYTHONPATH${pythonPathSuffix}";`);
  }

  const projectSandboxBashrc = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.bashrc',
  );
  if (fs.existsSync(projectSandboxBashrc)) {
    shellCmds.push(`source ${getContainerPath(projectSandboxBashrc)};`);
  }

  ports().forEach((p) =>
    shellCmds.push(
      `socat TCP4-LISTEN:${p},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${p} 2> /dev/null &`,
    ),
  );

  const cliArgs = process.argv.slice(2).map((arg) => quote([arg]));
  const cliCmd =
    process.env.NODE_ENV === 'development'
      ? process.env.DEBUG
        ? 'npm run debug --'
        : 'npm rebuild && npm run start --'
      : process.env.DEBUG
        ? `node --inspect-brk=0.0.0.0:${process.env.DEBUG_PORT || '9229'} $(which gemini)`
        : 'gemini';

  const args = [...shellCmds, cliCmd, ...cliArgs];

  return ['bash', '-c', args.join(' ')];
}

export async function start_sandbox(sandbox: string) {
  if (sandbox === 'sandbox-exec') {
    // disallow BUILD_SANDBOX
    if (process.env.BUILD_SANDBOX) {
      console.error('ERROR: cannot BUILD_SANDBOX when using MacOC Seatbelt');
      process.exit(1);
    }
    const profile = (process.env.SEATBELT_PROFILE ??= 'minimal');
    let profileFile = new URL(`sandbox-macos-${profile}.sb`, import.meta.url)
      .pathname;
    // if profile is anything other than 'minimal' or 'strict', then look for the profile file under the project settings directory
    if (profile !== 'minimal' && profile !== 'strict') {
      profileFile = path.join(
        SETTINGS_DIRECTORY_NAME,
        `sandbox-macos-${profile}.sb`,
      );
    }
    if (!fs.existsSync(profileFile)) {
      console.error(
        `ERROR: missing macos seatbelt profile file '${profileFile}'`,
      );
      process.exit(1);
    }
    console.error(`using macos seatbelt (profile: ${profile}) ...`);
    // if DEBUG is set, convert to --inspect-brk in NODE_OPTIONS
    if (process.env.DEBUG) {
      process.env.NODE_OPTIONS ??= '';
      process.env.NODE_OPTIONS += ` --inspect-brk`;
    }
    const args = [
      '-D',
      `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
      '-D',
      `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
      '-D',
      `HOME_DIR=${fs.realpathSync(os.homedir())}`,
      '-D',
      `CACHE_DIR=${fs.realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${process.env.NODE_OPTIONS}"`,
        ...process.argv.map((arg) => quote([arg])),
      ].join(' '),
    ];
    spawnSync(sandbox, args, { stdio: 'inherit' });
    return;
  }

  console.error(`hopping into sandbox (command: ${sandbox}) ...`);

  // determine full path for gemini-cli to distinguish linked vs installed setting
  const gcPath = fs.realpathSync(process.argv[1]);

  const projectSandboxDockerfile = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.Dockerfile',
  );
  const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

  const image = await getSandboxImageName(isCustomProjectSandbox);
  const workdir = path.resolve(process.cwd());
  const containerWorkdir = getContainerPath(workdir);

  // if BUILD_SANDBOX is set, then call scripts/build_sandbox.sh under gemini-cli repo
  //
  // note this can only be done with binary linked from gemini-cli repo
  if (process.env.BUILD_SANDBOX) {
    if (!gcPath.includes('gemini-cli/packages/')) {
      console.error(
        'ERROR: cannot build sandbox using installed gemini binary; ' +
          'run `npm link ./packages/cli` under gemini-cli repo to switch to linked binary.',
      );
      process.exit(1);
    } else {
      console.error('building sandbox ...');
      const gcRoot = gcPath.split('/packages/')[0];
      // if project folder has sandbox.Dockerfile under project settings folder, use that
      let buildArgs = '';
      const projectSandboxDockerfile = path.join(
        SETTINGS_DIRECTORY_NAME,
        'sandbox.Dockerfile',
      );
      if (isCustomProjectSandbox) {
        console.error(`using ${projectSandboxDockerfile} for sandbox`);
        buildArgs += `-f ${path.resolve(projectSandboxDockerfile)} -i ${image}`;
      }
      execSync(`cd ${gcRoot} && scripts/build_sandbox.sh -s ${buildArgs}`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          GEMINI_SANDBOX: sandbox, // in case sandbox is enabled via flags (see config.ts under cli package)
        },
      });
    }
  }

  // stop if image is missing
  if (!(await ensureSandboxImageIsPresent(sandbox, image))) {
    const remedy =
      image === LOCAL_DEV_SANDBOX_IMAGE_NAME
        ? 'Try running `npm run build:all` or `npm run build:sandbox` under the gemini-cli repo to build it locally, or check the image name and your network connection.'
        : 'Please check the image name, your network connection, or notify gemini-cli-dev@google.com if the issue persists.';
    console.error(
      `ERROR: Sandbox image '${image}' is missing or could not be pulled. ${remedy}`,
    );
    process.exit(1);
  }

  // use interactive mode and auto-remove container on exit
  // run init binary inside container to forward signals & reap zombies
  const args = ['run', '-i', '--rm', '--init', '--workdir', containerWorkdir];

  // add TTY only if stdin is TTY as well, i.e. for piped input don't init TTY in container
  if (process.stdin.isTTY) {
    args.push('-t');
  }

  // mount current directory as working directory in sandbox (set via --workdir)
  args.push('--volume', `${workdir}:${containerWorkdir}`);

  // mount user settings directory inside container, after creating if missing
  // note user/home changes inside sandbox and we mount at BOTH paths for consistency
  const userSettingsDirOnHost = USER_SETTINGS_DIR;
  const userSettingsDirInSandbox = getContainerPath(
    `/home/node/${SETTINGS_DIRECTORY_NAME}`,
  );
  if (!fs.existsSync(userSettingsDirOnHost)) {
    fs.mkdirSync(userSettingsDirOnHost);
  }
  args.push('--volume', `${userSettingsDirOnHost}:${userSettingsDirInSandbox}`);
  if (userSettingsDirInSandbox !== userSettingsDirOnHost) {
    args.push(
      '--volume',
      `${userSettingsDirOnHost}:${getContainerPath(userSettingsDirOnHost)}`,
    );
  }

  // mount os.tmpdir() as os.tmpdir() inside container
  args.push('--volume', `${os.tmpdir()}:${getContainerPath(os.tmpdir())}`);

  // mount paths listed in SANDBOX_MOUNTS
  if (process.env.SANDBOX_MOUNTS) {
    for (let mount of process.env.SANDBOX_MOUNTS.split(',')) {
      if (mount.trim()) {
        // parse mount as from:to:opts
        let [from, to, opts] = mount.trim().split(':');
        to = to || from; // default to mount at same path inside container
        opts = opts || 'ro'; // default to read-only
        mount = `${from}:${to}:${opts}`;
        // check that from path is absolute
        if (!path.isAbsolute(from)) {
          console.error(
            `ERROR: path '${from}' listed in SANDBOX_MOUNTS must be absolute`,
          );
          process.exit(1);
        }
        // check that from path exists on host
        if (!fs.existsSync(from)) {
          console.error(
            `ERROR: missing mount path '${from}' listed in SANDBOX_MOUNTS`,
          );
          process.exit(1);
        }
        console.error(`SANDBOX_MOUNTS: ${from} -> ${to} (${opts})`);
        args.push('--volume', mount);
      }
    }
  }

  // expose env-specified ports on the sandbox
  ports().forEach((p) => args.push('--publish', `${p}:${p}`));

  // if DEBUG is set, expose debugging port
  if (process.env.DEBUG) {
    const debugPort = process.env.DEBUG_PORT || '9229';
    args.push(`--publish`, `${debugPort}:${debugPort}`);
  }

  // name container after image, plus numeric suffix to avoid conflicts
  const imageName = parseImageName(image);
  let index = 0;
  const containerNameCheck = execSync(`${sandbox} ps -a --format "{{.Names}}"`)
    .toString()
    .trim();
  while (containerNameCheck.includes(`${imageName}-${index}`)) {
    index++;
  }
  const containerName = `${imageName}-${index}`;
  args.push('--name', containerName, '--hostname', containerName);

  // copy GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) {
    args.push('--env', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  }

  // copy GEMINI_MODEL
  if (process.env.GEMINI_MODEL) {
    args.push('--env', `GEMINI_MODEL=${process.env.GEMINI_MODEL}`);
  }

  // copy TERM and COLORTERM to try to maintain terminal setup
  if (process.env.TERM) {
    args.push('--env', `TERM=${process.env.TERM}`);
  }
  if (process.env.COLORTERM) {
    args.push('--env', `COLORTERM=${process.env.COLORTERM}`);
  }

  // copy VIRTUAL_ENV if under working directory
  // also mount-replace VIRTUAL_ENV directory with <project_settings>/sandbox.venv
  // sandbox can then set up this new VIRTUAL_ENV directory using sandbox.bashrc (see below)
  // directory will be empty if not set up, which is still preferable to having host binaries
  if (
    process.env.VIRTUAL_ENV?.toLowerCase().startsWith(workdir.toLowerCase())
  ) {
    const sandboxVenvPath = path.resolve(
      SETTINGS_DIRECTORY_NAME,
      'sandbox.venv',
    );
    if (!fs.existsSync(sandboxVenvPath)) {
      fs.mkdirSync(sandboxVenvPath, { recursive: true });
    }
    args.push(
      '--volume',
      `${sandboxVenvPath}:${getContainerPath(process.env.VIRTUAL_ENV)}`,
    );
    args.push(
      '--env',
      `VIRTUAL_ENV=${getContainerPath(process.env.VIRTUAL_ENV)}`,
    );
  }

  // copy additional environment variables from SANDBOX_ENV
  if (process.env.SANDBOX_ENV) {
    for (let env of process.env.SANDBOX_ENV.split(',')) {
      if ((env = env.trim())) {
        if (env.includes('=')) {
          console.error(`SANDBOX_ENV: ${env}`);
          args.push('--env', env);
        } else {
          console.error(
            'ERROR: SANDBOX_ENV must be a comma-separated list of key=value pairs',
          );
          process.exit(1);
        }
      }
    }
  }

  // copy NODE_OPTIONS
  if (process.env.NODE_OPTIONS) {
    args.push('--env', `NODE_OPTIONS="${process.env.NODE_OPTIONS}"`);
  }

  // set SANDBOX as container name
  args.push('--env', `SANDBOX=${containerName}`);

  // for podman only, use empty --authfile to skip unnecessary auth refresh overhead
  if (sandbox === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // Determine if the current user's UID/GID should be passed to the sandbox.
  // See shouldUseCurrentUserInSandbox for more details.
  if (await shouldUseCurrentUserInSandbox()) {
    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();
    args.push('--user', `${uid}:${gid}`);
    // when forcing a UID in the sandbox, $HOME can be reset to '/', so we copy $HOME as well
    args.push('--env', `HOME=${os.homedir()}`);
  }

  // push container image name
  args.push(image);

  // push container entrypoint (including args)
  args.push(...entrypoint(workdir));

  // spawn child and let it inherit stdio
  const child = spawn(sandbox, args, {
    stdio: 'inherit',
    detached: os.platform() !== 'win32',
  });

  child.on('error', (err) => {
    console.error('Sandbox process error:', err);
  });

  // uncomment this line (and comment the await on following line) to let parent exit
  // child.unref();
  await new Promise<void>((resolve) => {
    child.on('close', (code, signal) => {
      if (code !== 0) {
        console.log(
          `Sandbox process exited with code: ${code}, signal: ${signal}`,
        );
      }
      resolve();
    });
  });
}

// Helper functions to ensure sandbox image is present
async function imageExists(sandbox: string, image: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['images', '-q', image];
    const checkProcess = spawn(sandbox, args);

    let stdoutData = '';
    if (checkProcess.stdout) {
      checkProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
    }

    checkProcess.on('error', (err) => {
      console.warn(
        `Failed to start '${sandbox}' command for image check: ${err.message}`,
      );
      resolve(false);
    });

    checkProcess.on('close', (code) => {
      // Non-zero code might indicate docker daemon not running, etc.
      // The primary success indicator is non-empty stdoutData.
      if (code !== 0) {
        // console.warn(`'${sandbox} images -q ${image}' exited with code ${code}.`);
      }
      resolve(stdoutData.trim() !== '');
    });
  });
}

async function pullImage(sandbox: string, image: string): Promise<boolean> {
  console.info(`Attempting to pull image ${image} using ${sandbox}...`);
  return new Promise((resolve) => {
    const args = ['pull', image];
    const pullProcess = spawn(sandbox, args, { stdio: 'pipe' });

    let stderrData = '';

    const onStdoutData = (data: Buffer) => {
      console.info(data.toString().trim()); // Show pull progress
    };

    const onStderrData = (data: Buffer) => {
      stderrData += data.toString();
      console.error(data.toString().trim()); // Show pull errors/info from the command itself
    };

    const onError = (err: Error) => {
      console.warn(
        `Failed to start '${sandbox} pull ${image}' command: ${err.message}`,
      );
      cleanup();
      resolve(false);
    };

    const onClose = (code: number | null) => {
      if (code === 0) {
        console.info(`Successfully pulled image ${image}.`);
        cleanup();
        resolve(true);
      } else {
        console.warn(
          `Failed to pull image ${image}. '${sandbox} pull ${image}' exited with code ${code}.`,
        );
        if (stderrData.trim()) {
          // Details already printed by the stderr listener above
        }
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      if (pullProcess.stdout) {
        pullProcess.stdout.removeListener('data', onStdoutData);
      }
      if (pullProcess.stderr) {
        pullProcess.stderr.removeListener('data', onStderrData);
      }
      pullProcess.removeListener('error', onError);
      pullProcess.removeListener('close', onClose);
      if (pullProcess.connected) {
        pullProcess.disconnect();
      }
    };

    if (pullProcess.stdout) {
      pullProcess.stdout.on('data', onStdoutData);
    }
    if (pullProcess.stderr) {
      pullProcess.stderr.on('data', onStderrData);
    }
    pullProcess.on('error', onError);
    pullProcess.on('close', onClose);
  });
}

async function ensureSandboxImageIsPresent(
  sandbox: string,
  image: string,
): Promise<boolean> {
  console.info(`Checking for sandbox image: ${image}`);
  if (await imageExists(sandbox, image)) {
    console.info(`Sandbox image ${image} found locally.`);
    return true;
  }

  console.info(`Sandbox image ${image} not found locally.`);
  if (image === LOCAL_DEV_SANDBOX_IMAGE_NAME) {
    // user needs to build the image themself
    return false;
  }

  if (await pullImage(sandbox, image)) {
    // After attempting to pull, check again to be certain
    if (await imageExists(sandbox, image)) {
      console.info(`Sandbox image ${image} is now available after pulling.`);
      return true;
    } else {
      console.warn(
        `Sandbox image ${image} still not found after a pull attempt. This might indicate an issue with the image name or registry, or the pull command reported success but failed to make the image available.`,
      );
      return false;
    }
  }

  console.error(
    `Failed to obtain sandbox image ${image} after check and pull attempt.`,
  );
  return false; // Pull command failed or image still not present
}
