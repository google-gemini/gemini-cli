/**
 * Copyright 2025 Google LLC
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

import type { Example } from '../../types.js';

/**
 * Example: Generate Changelog from Git History
 *
 * This example shows how to automatically generate a changelog
 * from git commit history.
 */
const example: Example = {
  id: 'update-changelog',
  title: 'Generate Changelog from Git History',
  description:
    'Automatically create or update a CHANGELOG.md file by analyzing git commit messages and grouping changes',
  category: 'documentation',
  tags: ['changelog', 'git', 'release-notes', 'version', 'documentation'],
  difficulty: 'beginner',
  estimatedTime: '5-10 minutes',
  requiredTools: ['shell_execute', 'write_files'],
  requiredPermissions: ['shell-execute', 'file-write'],
  examplePrompt: `Generate a changelog for the latest release from git history:

1. **Get Commits**: Fetch all commits since the last release tag
2. **Categorize**: Group commits into Features, Fixes, Breaking Changes, etc.
3. **Format**: Create clean changelog entries from commit messages
4. **Add Details**: Include commit authors and PR references if available
5. **Version**: Add version number and release date
6. **Save**: Update CHANGELOG.md with the new release section

Follow Keep a Changelog format standards.`,
  expectedOutcome:
    'Updated CHANGELOG.md with categorized changes from recent commits',
  tips: [
    'Works best with conventional commit messages (feat:, fix:, etc.)',
    'Specify version number and date for the release',
    'Ask to follow semantic versioning guidelines',
    'Can generate for multiple releases at once',
  ],
  relatedExamples: [
    'generate-commit-message',
    'generate-readme',
    'git-workflow',
  ],
  documentationLinks: [
    '/docs/tools/shell.md',
    '/docs/examples/changelog.md',
  ],
  prerequisites: [
    'Have a git repository with commit history',
    'Navigate to the repository root',
  ],
  featured: false,
};

export default example;
