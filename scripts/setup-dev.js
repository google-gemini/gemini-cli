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

try {
  execSync('command -v npm', { stdio: 'ignore' });
} catch {
  console.log('npm not found. Installing npm via nvm...');
  try {
    execSync(
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash',
      { stdio: 'inherit' },
    );
    const nvmsh = `\\. "$HOME/.nvm/nvm.sh"`;
    execSync(`${nvmsh} && nvm install 22`, { stdio: 'inherit' });
    execSync(`${nvmsh} && node -v`, { stdio: 'inherit' });
    execSync(`${nvmsh} && nvm current`, { stdio: 'inherit' });
    execSync(`${nvmsh} && npm -v`, { stdio: 'inherit' });
  } catch {
    console.error('Failed to install nvm or node.');
    process.exit(1);
  }
}

console.log('Development environment setup complete.');
