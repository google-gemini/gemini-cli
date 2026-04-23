/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execSync } from 'node:child_process';

try {
  const count = execSync(
    'gh pr list --state open --limit 1000 --json number --jq length',
    {
      encoding: 'utf-8',
    },
  ).trim();
  console.log(`open_prs,${count}`);
} catch (error) {
  // Fallback if gh fails or no PRs found
  console.log('open_prs,0');
}
