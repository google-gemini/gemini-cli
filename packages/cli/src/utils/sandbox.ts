/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { quote, parse } from 'shell-quote';
import {
  USER_SETTINGS_DIR,
  SETTINGS_DIRECTORY_NAME,
} from '../config/settings.js';
import { promisify } from 'util';
import { Config, SandboxConfig } from '@google/gemini-cli-core';

const execAsync = promisify(exec);

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
const SANDBOX_NETWORK_NAME = 'gemini-cli-sandbox';
const SANDBOX_PROXY_NAME = 'gemini-cli-sandbox-proxy';
const BUILTIN_SEATBELT_PROFILES = [
  'permissive-open',
  'permissive-closed',
  'permissive-proxied',
  'restrictive-open',
  'restrictive-closed',
  'restrictive-proxied',
];

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

// docker does not allow container names to contain ':' or '/', so we
// parse those out to shorten the name
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

export async function start_sandbox(
  config: SandboxConfig,
  nodeArgs: string[] = [],
  cliConfig?: Config,
) {
  if (config.command === 'sandbox-exec') {
    // disallow BUILD_SANDBOX
    if (process.env.BUILD_SANDBOX) {
      console.error('ERROR: cannot BUILD_SANDBOX when using macOS Seatbelt');
      process.exit(1);
    }
    const profile = (process.env.SEATBELT_PROFILE ??= 'permissive-open');
    let profileFile = new URL(`sandbox-macos-${profile}.sb`, import.meta.url)
      .pathname;
    // if profile name is not recognized, then look for file under project settings directory
    if (!BUILTIN_SEATBELT_PROFILES.includes(profile)) {
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
    // Log on STDERR so it doesn't clutter the output on STDOUT
    console.error(`using macos seatbelt (profile: ${profile}) ...`);
    // if DEBUG is set, convert to --inspect-brk in NODE_OPTIONS
    const nodeOptions = [
      ...(process.env.DEBUG ? ['--inspect-brk'] : []),
      ...nodeArgs,
    ].join(' ');

    const args = [
      '-D',
      `TARGET_DIR=${fs.realpathSync(process.cwd())}`,
      '-D',
      `TMP_DIR=${fs.realpathSync(os.tmpdir())}`,
      '-D',
      `HOME_DIR=${fs.realpathSync(os.homedir())}`,
      '-D',
      `CACHE_DIR=${fs.realpathSync(execSync(`getconf DARWIN_USER_CACHE_DIR`).toString().trim())}`,
    ];

    // Add included directories from the workspace context
    // Always add 5 INCLUDE_DIR parameters to ensure .sb files can reference them
    const MAX_INCLUDE_DIRS = 5;
    const targetDir = fs.realpathSync(cliConfig?.getTargetDir() || '');
    const includedDirs: string[] = [];

    if (cliConfig) {
      const workspaceContext = cliConfig.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();

      // Filter out TARGET_DIR
      for (const dir of directories) {
        const realDir = fs.realpathSync(dir);
        if (realDir !== targetDir) {
          includedDirs.push(realDir);
        }
      }
    }

    for (let i = 0; i < MAX_INCLUDE_DIRS; i++) {
      let dirPath = '/dev/null'; // Default to a safe path that won't cause issues

      if (i < includedDirs.length) {
        dirPath = includedDirs[i];
      }

      args.push('-D', `INCLUDE_DIR_${i}=${dirPath}`);
    }

    args.push(
      '-f',
      profileFile,
      'sh',
      '-c',
      [
        `SANDBOX=sandbox-exec`,
        `NODE_OPTIONS="${nodeOptions}"`,
        ...process.argv.map((arg) => quote([arg])),
      ].join(' '),
    );
    // start and set up proxy if GEMINI_SANDBOX_PROXY_COMMAND is set
    const proxyCommand = process.env.GEMINI_SANDBOX_PROXY_COMMAND;
    let proxyProcess: ChildProcess | undefined = undefined;
    let sandboxProcess: ChildProcess | undefined = undefined;
    const sandboxEnv = { ...process.env };
    if (proxyCommand) {
      const proxy =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        'http://localhost:8877';
      sandboxEnv['HTTPS_PROXY'] = proxy;
      sandboxEnv['https_proxy'] = proxy; // lower-case can be required, e.g. for curl
      sandboxEnv['HTTP_PROXY'] = proxy;
      sandboxEnv['http_proxy'] = proxy;
      const noProxy = process.env.NO_PROXY || process.env.no_proxy;
      if (noProxy) {
        sandboxEnv['NO_PROXY'] = noProxy;
        sandboxEnv['no_proxy'] = noProxy;
      }
      proxyProcess = spawn(proxyCommand, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: true,
      });
      // install handlers to stop proxy on exit/signal
      const stopProxy = () => {
        console.log('stopping proxy ...');
        if (proxyProcess?.pid) {
          process.kill(-proxyProcess.pid, 'SIGTERM');
        }
      };
      process.on('exit', stopProxy);
      process.on('SIGINT', stopProxy);
      process.on('SIGTERM', stopProxy);

      // commented out as it disrupts ink rendering
      // proxyProcess.stdout?.on('data', (data) => {
      //   console.info(data.toString());
      // });
      proxyProcess.stderr?.on('data', (data) => {
        console.error(data.toString());
      });
      proxyProcess.on('close', (code, signal) => {
        console.error(
          `ERROR: proxy command '${proxyCommand}' exited with code ${code}, signal ${signal}`,
        );
        if (sandboxProcess?.pid) {
          process.kill(-sandboxProcess.pid, 'SIGTERM');
        }
        process.exit(1);
      });
      console.log('waiting for proxy to start ...');
      await execAsync(
        `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
      );
    }
    // spawn child and let it inherit stdio
    sandboxProcess = spawn(config.command, args, {
      stdio: 'inherit',
    });
    await new Promise((resolve) => sandboxProcess?.on('close', resolve));
    return;
  }

  console.error(`hopping into sandbox (command: ${config.command}) ...`);

  // determine full path for gemini-cli to distinguish linked vs installed setting
  const gcPath = fs.realpathSync(process.argv[1]);

  const projectSandboxDockerfile = path.join(
    SETTINGS_DIRECTORY_NAME,
    'sandbox.Dockerfile',
  );
  const isCustomProjectSandbox = fs.existsSync(projectSandboxDockerfile);

  const image = config.image;
  const workdir = path.resolve(process.cwd());
  const containerWorkdir = getContainerPath(workdir);

  // if BUILD_SANDBOX is set, then call scripts/build_sandbox.js under gemini-cli repo
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
      execSync(
        `cd ${gcRoot} && node scripts/build_sandbox.js -s ${buildArgs}`,
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            GEMINI_SANDBOX: config.command, // in case sandbox is enabled via flags (see config.ts under cli package)
          },
        },
      );
    }
  }

  // stop if image is missing
  if (!(await ensureSandboxImageIsPresent(config.command, image))) {
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

  // add custom flags from SANDBOX_FLAGS
  if (process.env.SANDBOX_FLAGS) {
    const flags = parse(process.env.SANDBOX_FLAGS, process.env).filter(
      (f): f is string => typeof f === 'string',
    );
    args.push(...flags);
  }

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

  // mount gcloud config directory if it exists
  const gcloudConfigDir = path.join(os.homedir(), '.config', 'gcloud');
  if (fs.existsSync(gcloudConfigDir)) {
    args.push(
      '--volume',
      `${gcloudConfigDir}:${getContainerPath(gcloudConfigDir)}:ro`,
    );
  }

  // mount ADC file if GOOGLE_APPLICATION_CREDENTIALS is set
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const adcFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(adcFile)) {
      args.push('--volume', `${adcFile}:${getContainerPath(adcFile)}:ro`);
      args.push(
        '--env',
        `GOOGLE_APPLICATION_CREDENTIALS=${getContainerPath(adcFile)}`,
      );
    }
  }

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

  // copy proxy environment variables, replacing localhost with SANDBOX_PROXY_NAME
  // copy as both upper-case and lower-case as is required by some utilities
  // GEMINI_SANDBOX_PROXY_COMMAND implies HTTPS_PROXY unless HTTP_PROXY is set
  const proxyCommand = process.env.GEMINI_SANDBOX_PROXY_COMMAND;

  if (proxyCommand) {
    let proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      'http://localhost:8877';
    proxy = proxy.replace('localhost', SANDBOX_PROXY_NAME);
    if (proxy) {
      args.push('--env', `HTTPS_PROXY=${proxy}`);
      args.push('--env', `https_proxy=${proxy}`); // lower-case can be required, e.g. for curl
      args.push('--env', `HTTP_PROXY=${proxy}`);
      args.push('--env', `http_proxy=${proxy}`);
    }
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (noProxy) {
      args.push('--env', `NO_PROXY=${noProxy}`);
      args.push('--env', `no_proxy=${noProxy}`);
    }

    // if using proxy, switch to internal networking through proxy
    if (proxy) {
      execSync(
        `${config.command} network inspect ${SANDBOX_NETWORK_NAME} || ${config.command} network create --internal ${SANDBOX_NETWORK_NAME}`,
      );
      args.push('--network', SANDBOX_NETWORK_NAME);
      // if proxy command is set, create a separate network w/ host access (i.e. non-internal)
      // we will run proxy in its own container connected to both host network and internal network
      // this allows proxy to work even on rootless podman on macos with host<->vm<->container isolation
      if (proxyCommand) {
        execSync(
          `${config.command} network inspect ${SANDBOX_PROXY_NAME} || ${config.command} network create ${SANDBOX_PROXY_NAME}`,
        );
      }
    }
  }

  // name container after image, plus numeric suffix to avoid conflicts
  const imageName = parseImageName(image);
  let index = 0;
  const containerNameCheck = execSync(
    `${config.command} ps -a --format "{{.Names}}"`,
  )
    .toString()
    .trim();
  while (containerNameCheck.includes(`${imageName}-${index}`)) {
    index++;
  }
  const containerName = `${imageName}-${index}`;
  args.push('--name', containerName, '--hostname', containerName);

  // copy GEMINI_API_KEY(s)
  if (process.env.GEMINI_API_KEY) {
    args.push('--env', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  }
  if (process.env.GOOGLE_API_KEY) {
    args.push('--env', `GOOGLE_API_KEY=${process.env.GOOGLE_API_KEY}`);
  }

  // copy GOOGLE_GENAI_USE_VERTEXAI
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_VERTEXAI=${process.env.GOOGLE_GENAI_USE_VERTEXAI}`,
    );
  }

  // copy GOOGLE_GENAI_USE_GCA
  if (process.env.GOOGLE_GENAI_USE_GCA) {
    args.push(
      '--env',
      `GOOGLE_GENAI_USE_GCA=${process.env.GOOGLE_GENAI_USE_GCA}`,
    );
  }

  // copy GOOGLE_CLOUD_PROJECT
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_PROJECT=${process.env.GOOGLE_CLOUD_PROJECT}`,
    );
  }

  // copy GOOGLE_CLOUD_LOCATION
  if (process.env.GOOGLE_CLOUD_LOCATION) {
    args.push(
      '--env',
      `GOOGLE_CLOUD_LOCATION=${process.env.GOOGLE_CLOUD_LOCATION}`,
    );
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
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const allNodeOptions = [
    ...(existingNodeOptions ? [existingNodeOptions] : []),
    ...nodeArgs,
  ].join(' ');

  if (allNodeOptions.length > 0) {
    args.push('--env', `NODE_OPTIONS="${allNodeOptions}"`);
  }

  // set SANDBOX as container name
  args.push('--env', `SANDBOX=${containerName}`);

  // for podman only, use empty --authfile to skip unnecessary auth refresh overhead
  if (config.command === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // Determine if the current user's UID/GID should be passed to the sandbox.
  // See shouldUseCurrentUserInSandbox for more details.
  let userFlag = '';
  const finalEntrypoint = entrypoint(workdir);

  if (process.env.GEMINI_CLI_INTEGRATION_TEST === 'true') {
    args.push('--user', 'root');
    userFlag = '--user root';
  } else if (await shouldUseCurrentUserInSandbox()) {
    // For the user-creation logic to work, the container must start as root.
    // The entrypoint script then handles dropping privileges to the correct user.
    args.push('--user', 'root');

    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();

    // Instead of passing --user to the main sandbox container, we let it
    // start as root, then create a user with the host's UID/GID, and
    // finally switch to that user to run the gemini process. This is
    // necessary on Linux to ensure the user exists within the
    // container's /etc/passwd file, which is required by os.userInfo().
    const username = 'gemini';
    const homeDir = getContainerPath(os.homedir());

    const setupUserCommands = [
      // Use -f with groupadd to avoid errors if the group already exists.
      `groupadd -f -g ${gid} ${username}`,
      // Create user only if it doesn't exist. Use -o for non-unique UID.
      `id -u ${username} &>/dev/null || useradd -o -u ${uid} -g ${gid} -d ${homeDir} -s /bin/bash ${username}`,
    ].join(' && ');

    const originalCommand = finalEntrypoint[2];
    const escapedOriginalCommand = originalCommand.replace(/'/g, "'\\''");

    // Use `su -p` to preserve the environment.
    const suCommand = `su -p ${username} -c '${escapedOriginalCommand}'`;

    // The entrypoint is always `['bash', '-c', '<command>']`, so we modify the command part.
    finalEntrypoint[2] = `${setupUserCommands} && ${suCommand}`;

    // We still need userFlag for the simpler proxy container, which does not have this issue.
    userFlag = `--user ${uid}:${gid}`;
    // When forcing a UID in the sandbox, $HOME can be reset to '/', so we copy $HOME as well.
    args.push('--env', `HOME=${os.homedir()}`);
  }

  // push container image name
  args.push(image);

  // push container entrypoint (including args)
  args.push(...finalEntrypoint);

  // start and set up proxy if GEMINI_SANDBOX_PROXY_COMMAND is set
  let proxyProcess: ChildProcess | undefined = undefined;
  let sandboxProcess: ChildProcess | undefined = undefined;

  if (proxyCommand) {
    // run proxyCommand in its own container
    const proxyContainerCommand = `${config.command} run --rm --init ${userFlag} --name ${SANDBOX_PROXY_NAME} --network ${SANDBOX_PROXY_NAME} -p 8877:8877 -v ${process.cwd()}:${workdir} --workdir ${workdir} ${image} ${proxyCommand}`;
    proxyProcess = spawn(proxyContainerCommand, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true,
    });
    // install handlers to stop proxy on exit/signal
    const stopProxy = () => {
      console.log('stopping proxy container ...');
      execSync(`${config.command} rm -f ${SANDBOX_PROXY_NAME}`);
    };
    process.on('exit', stopProxy);
    process.on('SIGINT', stopProxy);
    process.on('SIGTERM', stopProxy);

    // commented out as it disrupts ink rendering
    // proxyProcess.stdout?.on('data', (data) => {
    //   console.info(data.toString());
    // });
    proxyProcess.stderr?.on('data', (data) => {
      console.error(data.toString().trim());
    });
    proxyProcess.on('close', (code, signal) => {
      console.error(
        `ERROR: proxy container command '${proxyContainerCommand}' exited with code ${code}, signal ${signal}`,
      );
      if (sandboxProcess?.pid) {
        process.kill(-sandboxProcess.pid, 'SIGTERM');
      }
      process.exit(1);
    });
    console.log('waiting for proxy to start ...');
    await execAsync(
      `until timeout 0.25 curl -s http://localhost:8877; do sleep 0.25; done`,
    );
    // connect proxy container to sandbox network
    // (workaround for older versions of docker that don't support multiple --network args)
    await execAsync(
      `${config.command} network connect ${SANDBOX_NETWORK_NAME} ${SANDBOX_PROXY_NAME}`,
    );
  }

  // spawn child and let it inherit stdio
  sandboxProcess = spawn(config.command, args, {
    stdio: 'inherit',
  });

  sandboxProcess.on('error', (err) => {
    console.error('Sandbox process error:', err);
  });

  await new Promise<void>((resolve) => {
    sandboxProcess?.on('close', (code, signal) => {
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
    // user needs to build the image themselves
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
