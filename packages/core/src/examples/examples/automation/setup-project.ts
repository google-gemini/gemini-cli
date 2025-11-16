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
 * Example: Automate Project Setup
 *
 * This example demonstrates how to automate the creation of a new
 * project with all necessary files and configuration.
 */
const example: Example = {
  id: 'setup-new-project',
  title: 'Automate New Project Setup',
  description:
    'Quickly scaffold a new project with proper structure, configuration files, and initial code',
  category: 'automation',
  tags: ['scaffolding', 'setup', 'initialization', 'boilerplate', 'project'],
  difficulty: 'intermediate',
  estimatedTime: '10-15 minutes',
  requiredTools: [
    'create_directory',
    'write_files',
    'shell_execute',
  ],
  requiredPermissions: [
    'directory-create',
    'file-write',
    'shell-execute',
  ],
  examplePrompt: `Set up a new TypeScript Node.js project with best practices:

1. **Project Structure**: Create standard directory layout (src/, tests/, docs/)
2. **Configuration Files**: Generate package.json, tsconfig.json, .gitignore, .eslintrc
3. **Initial Code**: Create basic src/index.ts with example code
4. **Dev Dependencies**: Install TypeScript, testing framework, linter
5. **Scripts**: Add npm scripts for build, test, lint, dev
6. **Documentation**: Create README.md with setup instructions
7. **Git Init**: Initialize git repository with initial commit

Make it production-ready from the start.`,
  expectedOutcome:
    'Fully configured project ready for development with all tools and structure in place',
  tips: [
    'Specify your preferred tools and frameworks',
    'Ask for CI/CD configuration files',
    'Request Docker setup if needed',
    'Can adapt for any language or framework',
  ],
  relatedExamples: [
    'generate-readme',
    'git-workflow',
    'run-checks',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/project-setup.md',
  ],
  prerequisites: [
    'Create and navigate to an empty directory for the new project',
  ],
  featured: false,
};

export default example;
