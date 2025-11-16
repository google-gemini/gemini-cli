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
 * Example: Run Pre-Commit Checks
 *
 * This example shows how to automate running all pre-commit checks
 * including tests, linting, formatting, and type checking.
 */
const example: Example = {
  id: 'run-precommit-checks',
  title: 'Run All Pre-Commit Checks',
  description:
    'Automate running tests, linting, formatting, type checking, and other quality checks before committing',
  category: 'automation',
  tags: ['testing', 'linting', 'ci', 'quality', 'validation', 'pre-commit'],
  difficulty: 'beginner',
  estimatedTime: '5-10 minutes',
  requiredTools: ['shell_execute'],
  requiredPermissions: ['shell-execute'],
  examplePrompt: `Run all pre-commit checks for this project and fix any issues:

1. **Lint Code**: Run ESLint/Pylint and fix auto-fixable issues
2. **Format Code**: Apply Prettier/Black formatting
3. **Type Check**: Run TypeScript/mypy type checker
4. **Run Tests**: Execute unit and integration tests
5. **Check Build**: Ensure project builds successfully
6. **Report Results**: Summarize what passed, failed, or was fixed

If anything fails, show me what needs manual attention.`,
  expectedOutcome:
    'All quality checks run with issues fixed automatically or flagged for manual fix',
  tips: [
    'Customize to match your project\'s tooling',
    'Ask to create a pre-commit hook script',
    'Request fix suggestions for failing checks',
    'Can be run before every commit or as CI check',
  ],
  relatedExamples: [
    'write-tests',
    'review-code-quality',
    'git-workflow',
  ],
  documentationLinks: [
    '/docs/tools/shell.md',
    '/docs/examples/ci-automation.md',
  ],
  prerequisites: [
    'Have a project with configured linters, formatters, and tests',
  ],
  featured: true,
};

export default example;
