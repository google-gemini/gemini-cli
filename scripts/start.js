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
// Unless required by applicable law_or_agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// check build status, write warnings to file for app to display if needed
execSync('node ./scripts/check-build-status.js', {
  stdio: 'inherit',
  cwd: root,
});

const nodeArgs = ['--no-warnings=DEP0040'];
let sandboxCommand = undefined;
try {
  sandboxCommand = execSync('node scripts/sandbox_command.js', {
    cwd: root,
  })
    .toString()
    .trim();
} catch {
  // ignore
}
// if debugging is enabled and sandboxing is disabled, use --inspect-brk flag
// note with sandboxing this flag is passed to the binary inside the sandbox
// inside sandbox SANDBOX should be set and sandbox_command.js should fail
const isInDebugMode = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

if (isInDebugMode && !sandboxCommand) {
  if (process.env.SANDBOX) {
    const port = process.env.DEBUG_PORT || '9229';
    nodeArgs.push(`--inspect-brk=0.0.0.0:${port}`);
  } else {
    nodeArgs.push('--inspect-brk');
  }
}

nodeArgs.push(join(root, 'packages', 'cli'));
nodeArgs.push(...process.argv.slice(2));

const env = {
  ...process.env,
  CLI_VERSION: pkg.version,
  DEV: 'true',
};

if (isInDebugMode) {
  // If this is not set, the debugger will pause on the outer process rather
  // than the relaunched process making it harder to debug.
  env.GEMINI_CLI_NO_RELAUNCH = 'true';
}

// Strip CI-related env vars before spawning the dev child. `is-in-ci`
// (loaded transitively by `ink`) treats `CI`, `CONTINUOUS_INTEGRATION`,
// and any `CI_*`-prefixed env var as a signal to disable interactive
// rendering, which makes `npm run start` hang silently after the banner
// whenever a developer has e.g. `CI_TOKEN` set in their shell. The bundled
// path closes this via an esbuild alias on `is-in-ci` (#4822); we do the
// dev-mode equivalent here so the unbundled `npm run start` flow doesn't
// diverge. See issue #22452.
const ciVarNames = Object.keys(env).filter(
  (k) => k === 'CI' || k === 'CONTINUOUS_INTEGRATION' || k.startsWith('CI_'),
);
if (ciVarNames.length > 0) {
  for (const name of ciVarNames) {
    delete env[name];
  }
  process.stderr.write(
    '[gemini-cli/dev] Cleared CI-related env vars to keep `ink` interactive: ' +
      ciVarNames.join(', ') +
      '\n[gemini-cli/dev] These vars are unset in the CLI process and its shell-tool subprocesses. Use the bundled build (`npm run bundle && node bundle/gemini.js`) to preserve them.\n',
  );
}

const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code);
});
