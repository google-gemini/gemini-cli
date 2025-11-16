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
 * Example: Generate API Documentation
 *
 * This example demonstrates how to automatically generate comprehensive
 * API documentation from code.
 */
const example: Example = {
  id: 'generate-api-documentation',
  title: 'Generate API Documentation from Code',
  description:
    'Automatically create comprehensive API documentation by analyzing code structure, parameters, and usage',
  category: 'documentation',
  tags: ['api', 'documentation', 'reference', 'auto-generation'],
  difficulty: 'intermediate',
  estimatedTime: '10-15 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-read', 'file-write'],
  examplePrompt: `Generate comprehensive API documentation for @src/api/:

1. **Endpoints**: List all API endpoints with HTTP methods
2. **Parameters**: Document request parameters, types, and validation
3. **Responses**: Describe response formats, status codes, and examples
4. **Authentication**: Document authentication requirements
5. **Error Handling**: List possible errors and how to handle them
6. **Examples**: Provide code examples for each endpoint
7. **Save**: Create docs/api-reference.md with the documentation

Make it clear enough for external developers to use.`,
  expectedOutcome:
    'Complete API documentation with endpoint details, parameters, responses, and examples',
  tips: [
    'Works with REST APIs, GraphQL, or any documented code',
    'Ask for OpenAPI/Swagger specification format',
    'Request interactive examples or curl commands',
    'Can generate docs in multiple formats (Markdown, HTML, PDF)',
  ],
  relatedExamples: [
    'generate-readme',
    'update-changelog',
    'explain-codebase-architecture',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/documentation.md',
  ],
  prerequisites: [
    'Have API code with routes/endpoints defined',
  ],
  featured: false,
};

export default example;
