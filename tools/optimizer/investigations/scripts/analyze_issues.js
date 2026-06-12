/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execSync } from 'node:child_process';

try {
  const output = execSync(`gh issue list --state open --json number,labels,assignees,comments --limit 1000`, { encoding: 'utf-8' });
  const issues = JSON.parse(output);

  const untriaged = issues.filter(i => i.labels.some(l => l.name === 'status/need-triage')).length;
  const unassigned = issues.filter(i => i.assignees.length === 0).length;
  const noComments = issues.filter(i => i.comments.length === 0).length;

  console.log(`Total Open Issues: ${issues.length}`);
  console.log(`Untriaged Issues: ${untriaged}`);
  console.log(`Unassigned Issues: ${unassigned}`);
  console.log(`Issues with 0 Comments: ${noComments}`);

} catch (err) {
  console.error('Error analyzing issues:', err);
  process.exit(1);
}
