/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawnSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { quote } from 'shell-quote';

// node.js equivalent of scripts/sandbox_command.sh
export function sandbox_command(): string {
  const sandbox = process.env.GEMINI_CODE_SANDBOX?.toLowerCase().trim() ?? '';
  if (['1', 'true'].includes(sandbox)) {
    // look for docker or podman, in that order
    if (execSync('command -v docker || true').toString().trim()) {
      return 'docker'; // Set sandbox to 'docker' if found
    } else if (execSync('command -v podman || true').toString().trim()) {
      return 'podman'; // Set sandbox to 'podman' if found
    } else {
      console.error(
        'ERROR: failed to determine command for sandbox; ' +
          'install docker or podman or specify command in GEMINI_CODE_SANDBOX',
      );
      process.exit(1);
    }
  } else if (sandbox) {
    // confirm that specfied command exists
    if (execSync(`command -v ${sandbox} || true`).toString().trim()) {
      return sandbox;
    } else {
      console.error(
        `ERROR: missing sandbox command '${sandbox}' (from GEMINI_CODE_SANDBOX)`,
      );
      process.exit(1);
    }
  } else {
    return ''; // no sandbox
  }
}

function parseImageName(image: string): string {
  const parts = image.split(':');
  const uri = parts[0];
  const uriParts = uri.split('/');
  const name = uriParts.at(-1);
  const tag = parts.length > 1 ? `-${parts[1]}` : '';
  return `${name}${tag}`;
}

// node.js equivalent of scripts/start_sandbox.sh
export async function start_sandbox(sandbox: string) {
  // determine full path for gemini-code to distinguish linked vs installed setting
  const gcPath = execSync(`realpath $(which gemini-code)`).toString().trim();

  // if project is gemini-code, then switch to -dev image & run CLI from ${workdir}/packages/cli
  let image = process.env.GEMINI_CODE_SANDBOX_IMAGE ?? 'gemini-code-sandbox';
  const project = path.basename(process.cwd());
  const workdir = process.cwd();
  let cliPath = '$(which gemini-code)';
  if (project === 'gemini-code') {
    image = 'gemini-code-sandbox-dev';
    cliPath = quote([`${workdir}/packages/cli`]);
  }

  // if BUILD_SANDBOX is set, then call scripts/build_sandbox.sh under gemini-code repo
  // note this can only be done with binary linked from gemini-code repo
  if (process.env.BUILD_SANDBOX) {
    if (!gcPath.includes('gemini-code/packages/')) {
      console.error(
        'ERROR: cannot BUILD_SANDBOX using installed gemini-code binary; ' +
          'run `npm link ./packages/cli` under gemini-code repo to switch to linked binary.',
      );
      process.exit(1);
    } else {
      console.log('building sandbox ...');
      const gcRoot = gcPath.split('/packages/')[0];
      spawnSync(`cd ${gcRoot} && scripts/build_sandbox.sh`, {
        stdio: 'inherit',
        shell: true,
      });
    }
  }

  // stop if image is missing
  if (!execSync(`${sandbox} images -q ${image}`).toString().trim()) {
    const remedy = gcPath.includes('gemini-code/packages/')
      ? 'Try `scripts/build_sandbox.sh` under gemini-code repo.'
      : 'Please notify gemini-code-dev@google.com.';
    console.error(`ERROR: ${image} is missing. ${remedy}`);
    process.exit(1);
  }

  // use interactive tty mode and auto-remove container on exit
  // run init binary inside container to forward signals & reap zombies
  const args = ['run', '-it', '--rm', '--init', '--workdir', workdir];

  // mount current directory as ${workdir} inside container
  args.push('--volume', `${process.cwd()}:${workdir}`);

  // mount os.tmpdir() as /tmp inside container
  args.push('--volume', `${os.tmpdir()}:/tmp`);

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
        console.log(`SANDBOX_MOUNTS: ${from} -> ${to} (${opts})`);
        args.push('--volume', mount);
      }
    }
  }

  // name container after image, plus numeric suffix to avoid conflicts
  const containerName = parseImageName(image);
  let index = 0;
  while (
    execSync(
      `${sandbox} ps -a --format "{{.Names}}" | grep "${containerName}-${index}" || true`,
    )
      .toString()
      .trim()
  ) {
    index++;
  }
  args.push(
    '--name',
    `${containerName}-${index}`,
    '--hostname',
    `${containerName}-${index}`,
  );

  // copy GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) {
    args.push('--env', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  }

  // copy GEMINI_CODE_MODEL
  if (process.env.GEMINI_CODE_MODEL) {
    args.push('--env', `GEMINI_CODE_MODEL=${process.env.GEMINI_CODE_MODEL}`);
  }

  // copy TERMINAL_TOOL to optionally enable shell tool
  if (process.env.TERMINAL_TOOL) {
    args.push('--env', `TERMINAL_TOOL=${process.env.TERMINAL_TOOL}`);
  }

  // copy TERM and COLORTERM to try to maintain terminal setup
  if (process.env.TERM) {
    args.push('--env', `TERM=${process.env.TERM}`);
  }
  if (process.env.COLORTERM) {
    args.push('--env', `COLORTERM=${process.env.COLORTERM}`);
  }

  // copy additional environment variables from SANDBOX_ENV
  if (process.env.SANDBOX_ENV) {
    for (let env of process.env.SANDBOX_ENV.split(',')) {
      if ((env = env.trim())) {
        if (env.includes('=')) {
          console.log(`SANDBOX_ENV: ${env}`);
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

  // set SANDBOX as container name
  args.push('--env', `SANDBOX=${containerName}-${index}`);

  // for podman only, use empty --authfile to skip unnecessary auth refresh overhead
  if (sandbox === 'podman') {
    const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
    fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
    args.push('--authfile', emptyAuthFilePath);
  }

  // enable debugging via node --inspect-brk if DEBUG is set
  const nodeArgs = [];
  const debugPort = process.env.DEBUG_PORT || '9229';
  if (process.env.DEBUG) {
    args.push('--publish', `${debugPort}:${debugPort}`);
    nodeArgs.push(`--inspect-brk=0.0.0.0:${debugPort}`);
  }

  // open additional ports if SANDBOX_PORTS is set
  // also set up redirects (via socat) so servers can listen on localhost instead of 0.0.0.0
  let bashCmd = '';
  if (process.env.SANDBOX_PORTS) {
    for (let port of process.env.SANDBOX_PORTS.split(',')) {
      if ((port = port.trim())) {
        console.log(`SANDBOX_PORTS: ${port}`);
        args.push('--publish', `${port}:${port}`);
        bashCmd += `socat TCP4-LISTEN:${port},bind=$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:${port} 2> /dev/null & `;
      }
    }
  }

  // specify --user as "$(id -u):$(id -g)" if SANDBOX_SET_UID_GID is 1|true
  // only necessary if user mapping is not handled by sandboxing setup on host
  // (e.g. rootful docker on linux w/o userns-remap configured)
  if (['1', 'true'].includes(process.env.SANDBOX_SET_UID_GID ?? '')) {
    const uid = execSync('id -u').toString().trim();
    const gid = execSync('id -g').toString().trim();
    args.push('--user', `${uid}:${gid}`);
  }

  // append remaining args (image, bash -c "node node_args... cli path cli_args...")
  // node_args and cli_args need to be quoted before being inserted into bash_cmd
  const quotedNodeArgs = nodeArgs.map((arg) => quote([arg]));
  const quotedCliArgs = process.argv.slice(2).map((arg) => quote([arg]));
  bashCmd += `node ${quotedNodeArgs.join(' ')} ${cliPath} ${quotedCliArgs.join(' ')}`;
  args.push(image, 'bash', '-c', bashCmd);

  // spawn child and let it inherit stdio
  const child = spawn(sandbox, args, {
    stdio: 'inherit',
    detached: true,
  });

  // uncomment this line (and comment the await on following line) to let parent exit
  // child.unref();
  await new Promise((resolve) => {
    child.on('close', resolve);
  });
}
