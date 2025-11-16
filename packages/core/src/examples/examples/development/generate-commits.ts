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

const example: Example = {
  id: 'generate-commit-message',
  title: 'Generate Git Commit Message',
  description:
    'Create meaningful, well-formatted commit messages based on your staged changes',
  category: 'development',
  tags: ['git', 'commits', 'automation', 'conventional-commits'],
  difficulty: 'beginner',
  estimatedTime: '1 minute',
  requiredTools: ['run_shell_command'],
  requiredPermissions: [],
  examplePrompt: `Look at my git staged changes and write a clear, concise commit message.

Follow these guidelines:
1. Use conventional commits format (feat:, fix:, docs:, etc.)
2. First line: brief summary (50 chars or less)
3. Blank line, then detailed explanation if needed
4. Explain WHAT and WHY, not HOW
5. Reference issue numbers if applicable

Format as a complete commit message I can copy-paste.`,
  expectedOutcome:
    'Well-formatted commit message ready to use with git commit -m',
  tips: [
    'Stage your changes first with git add',
    'Review the message before committing',
    'Adjust the message to match your team\'s conventions',
    'Can save this as a custom command for frequent use',
  ],
  relatedExamples: ['review-changes', 'interactive-rebase', 'pr-description'],
  documentationLinks: [
    '/docs/tools/shell.md',
    '/docs/examples/git-workflow.md',
  ],
  prerequisites: ['Stage your changes with: git add <files>'],
  featured: true,
};

export default example;
