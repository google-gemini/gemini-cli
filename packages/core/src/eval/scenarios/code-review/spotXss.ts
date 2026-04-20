/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const spotXss: EvalScenario = {
  id: 'review-spot-xss',
  name: 'Spot XSS Vulnerability',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify and flag a cross-site scripting (XSS) vulnerability in template rendering.',
  setupFiles: {
    'src/template.ts': `
export function renderUserProfile(user: { name: string; bio: string }): string {
  return \`
    <div class="profile">
      <h1>\${user.name}</h1>
      <p>\${user.bio}</p>
    </div>
  \`;
}
`,
  },
  prompt:
    'Review src/template.ts for security vulnerabilities. Identify the XSS issue and fix it by escaping user input.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/template.ts',
        shouldExist: true,
        contentContains: ['escape'],
        contentNotContains: ['${user.name}'],
      },
    ],
    outputContains: ['XSS'],
  },
  tags: ['xss', 'security', 'intermediate'],
};
