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
 * Example: Identify Project Dependencies
 *
 * This example helps users understand all dependencies in a project,
 * their purposes, and potential issues.
 */
const example: Example = {
  id: 'identify-dependencies',
  title: 'Analyze Project Dependencies',
  description:
    'Get a comprehensive overview of project dependencies, their purposes, versions, and potential security or compatibility issues',
  category: 'code-understanding',
  tags: ['dependencies', 'packages', 'libraries', 'security', 'audit'],
  difficulty: 'beginner',
  estimatedTime: '3-5 minutes',
  requiredTools: ['read_files'],
  requiredPermissions: ['file-read'],
  examplePrompt: `Analyze @package.json and provide a comprehensive dependency report:

1. **Direct Dependencies**: List and explain what each is used for
2. **Dev Dependencies**: Identify development-only dependencies
3. **Version Analysis**: Flag outdated or incompatible versions
4. **Security Issues**: Highlight known vulnerabilities
5. **Unused Dependencies**: Identify packages that might not be needed
6. **Recommendations**: Suggest updates or alternatives

Make the report actionable and easy to understand.`,
  expectedOutcome:
    'Organized dependency report with explanations, issues, and actionable recommendations',
  tips: [
    'Works with package.json, requirements.txt, Cargo.toml, etc.',
    'Ask about specific dependencies for more detail',
    'Request update commands for outdated packages',
    'Combine with "find where each dependency is used"',
  ],
  relatedExamples: [
    'find-vulnerabilities',
    'review-code-quality',
    'optimize-performance',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/dependency-management.md',
  ],
  prerequisites: [
    'Have a package.json or similar dependency file in your project',
  ],
  featured: true,
};

export default example;
