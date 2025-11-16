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
  id: 'find-security-vulnerabilities',
  title: 'Find Security Vulnerabilities',
  description:
    'Scan code for common security vulnerabilities like SQL injection, XSS, command injection, and other OWASP Top 10 issues',
  category: 'code-understanding',
  tags: ['security', 'code-review', 'vulnerabilities', 'owasp'],
  difficulty: 'intermediate',
  estimatedTime: '5-10 minutes',
  requiredTools: ['read_files', 'grep_search'],
  requiredPermissions: ['directory-read'],
  examplePrompt: `Perform a security audit of this codebase. Look for:

1. SQL Injection vulnerabilities (unsafe query construction)
2. Cross-Site Scripting (XSS) risks (unescaped user input)
3. Command Injection (unsafe shell command execution)
4. Path Traversal vulnerabilities
5. Insecure authentication/authorization
6. Hardcoded secrets or credentials
7. Insecure cryptography usage
8. Missing input validation

For each issue found, explain:
- Where it is (file and line number)
- Why it's a vulnerability
- How to fix it
- Severity level (Critical/High/Medium/Low)`,
  expectedOutcome:
    'Detailed security audit report with vulnerabilities categorized by severity and fix recommendations',
  tips: [
    'Review the findings carefully - not all flagged items may be actual vulnerabilities',
    'Focus on user input handling and database queries first',
    'Test fixes in a development environment before applying to production',
    'Consider running automated security scanners as well',
  ],
  relatedExamples: [
    'code-review-checklist',
    'fix-security-issue',
    'audit-dependencies',
  ],
  documentationLinks: [
    '/docs/tools/grep.md',
    '/docs/get-started/examples.md',
  ],
  featured: true,
};

export default example;
