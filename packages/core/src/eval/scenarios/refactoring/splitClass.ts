/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const splitClass: EvalScenario = {
  id: 'refactor-split-class',
  name: 'Split God Class into Smaller Classes',
  category: 'refactoring',
  difficulty: 'hard',
  description:
    'Split a large class with too many responsibilities into separate focused classes.',
  setupFiles: {
    'src/manager.ts': `
export class UserManager {
  // User CRUD
  createUser(name: string, email: string) { return { name, email }; }
  deleteUser(id: string) { return true; }
  updateUser(id: string, data: Record<string, string>) { return data; }

  // Authentication
  login(email: string, password: string) { return 'token'; }
  logout(token: string) { return true; }
  refreshToken(token: string) { return 'new-token'; }

  // Email notifications
  sendWelcomeEmail(email: string) { return true; }
  sendResetEmail(email: string) { return true; }
  sendNotification(email: string, message: string) { return true; }

  // Reporting
  getUserStats() { return { total: 0, active: 0 }; }
  generateReport() { return 'report'; }
}
`,
  },
  prompt:
    'Split the UserManager god class in src/manager.ts into smaller, focused classes (e.g., UserService, AuthService, EmailService, ReportingService).',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/manager.ts',
        shouldExist: true,
        contentContains: ['class'],
        contentNotContains: [
          'sendWelcomeEmail(email: string) { return true; }\n  sendResetEmail',
        ],
      },
    ],
  },
  tags: ['god-class', 'single-responsibility', 'advanced'],
};
