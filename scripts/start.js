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

// Strip CI-detection env vars before spawning the dev child. `is-in-ci`
// (loaded transitively by `ink`, v2.0.0 in this repo) returns true when
// either `CI` or `CONTINUOUS_INTEGRATION` is set to a non-falsy value,
// and `ink` then disables interactive rendering — leaving `npm run start`
// hanging silently after the banner. The bundled path closes this via an
// esbuild alias on `is-in-ci` (#4822); we do the dev-mode equivalent here
// so the unbundled flow doesn't diverge. The filter is intentionally
// narrow: `is-in-ci` does not look at any `CI_*`-prefixed variables, so
// developer-set tokens like `CI_TOKEN` / `CI_BUILD_ID` are preserved.
// See issue #22452.
const isFalsy = (v) => v === undefined || v === '0' || v === 'false';
const ciVarNames = ['CI', 'CONTINUOUS_INTEGRATION'].filter(
  (k) => !isFalsy(env[k]),
);
if (ciVarNames.length > 0) {
  for (const name of ciVarNames) {
    delete env[name];
  }
  process.stderr.write(
    '[gemini-cli/dev] Cleared CI-detection env vars to keep `ink` interactive: ' +
      ciVarNames.join(', ') +
      '\n[gemini-cli/dev] These vars are unset in the CLI process and its shell-tool subprocesses. Use the bundled build (`npm run bundle && node bundle/gemini.js`) to preserve them.\n',
  );
}

const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code);
});
