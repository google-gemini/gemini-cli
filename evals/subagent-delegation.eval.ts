/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';

import { evalTest } from './test-helper.js';

/**
 * Behavioral evals for the built-in codebase_investigator subagent.
 *
 * These tests verify that the main agent correctly delegates codebase
 * analysis tasks to the codebase_investigator subagent, rather than
 * attempting to handle them inline.
 *
 * Related issues:
 * - #14430 (raw JSON output from codebase_investigator not synthesized)
 * - #20715 (low quality subagent failure feedback)
 */
describe('subagent delegation — codebase_investigator', () => {
  /**
   * When asked to explain a codebase's architecture, the main agent should
   * invoke codebase_investigator rather than reading files itself. The prompt
   * deliberately avoids naming the subagent so that we test the agent's own
   * routing logic.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should delegate codebase analysis to codebase_investigator',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'Explain the architecture of this project. How are the modules connected and what design patterns are used?',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'example-app',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
      'src/index.ts': [
        'import { createApp } from "./app.js";',
        'import { router } from "./routes/index.js";',
        '',
        'const app = createApp();',
        'app.use(router);',
        'app.listen(3000);',
      ].join('\n'),
      'src/app.ts': [
        'import express from "express";',
        'import { errorHandler } from "./middleware/errorHandler.js";',
        '',
        'export function createApp() {',
        '  const app = express();',
        '  app.use(express.json());',
        '  app.use(errorHandler);',
        '  return app;',
        '}',
      ].join('\n'),
      'src/routes/index.ts': [
        'import { Router } from "express";',
        'import { UserController } from "../controllers/userController.js";',
        '',
        'export const router = Router();',
        'router.get("/users", UserController.list);',
        'router.post("/users", UserController.create);',
      ].join('\n'),
      'src/controllers/userController.ts': [
        'import { UserService } from "../services/userService.js";',
        '',
        'export class UserController {',
        '  static async list(req: any, res: any) {',
        '    const users = await UserService.findAll();',
        '    res.json(users);',
        '  }',
        '  static async create(req: any, res: any) {',
        '    const user = await UserService.create(req.body);',
        '    res.status(201).json(user);',
        '  }',
        '}',
      ].join('\n'),
      'src/services/userService.ts': [
        'import { UserRepository } from "../repositories/userRepository.js";',
        '',
        'export class UserService {',
        '  static async findAll() {',
        '    return UserRepository.findAll();',
        '  }',
        '  static async create(data: { name: string; email: string }) {',
        '    return UserRepository.create(data);',
        '  }',
        '}',
      ].join('\n'),
      'src/repositories/userRepository.ts': [
        'const users: Array<{ id: number; name: string; email: string }> = [];',
        'let nextId = 1;',
        '',
        'export class UserRepository {',
        '  static async findAll() {',
        '    return users;',
        '  }',
        '  static async create(data: { name: string; email: string }) {',
        '    const user = { id: nextId++, ...data };',
        '    users.push(user);',
        '    return user;',
        '  }',
        '}',
      ].join('\n'),
      'src/middleware/errorHandler.ts': [
        'export function errorHandler(err: Error, req: any, res: any, next: any) {',
        '  console.error(err.stack);',
        '  res.status(500).json({ error: "Internal Server Error" });',
        '}',
      ].join('\n'),
    },
    assert: async (rig) => {
      const wasInvestigatorCalled = await rig.waitForToolCall(
        'codebase_investigator',
      );
      expect(
        wasInvestigatorCalled,
        'Expected codebase_investigator to be invoked for architecture analysis',
      ).toBe(true);
    },
  });

  /**
   * A bug-investigation prompt should also trigger codebase_investigator,
   * since the agent's description specifically lists "bug root-cause
   * analysis" as a use case.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should delegate bug investigation to codebase_investigator',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'There is a bug where creating a user with a duplicate email does not return an error. Investigate the root cause.',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'buggy-app',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
      'src/index.ts':
        'import { UserService } from "./services/userService.js";\nconsole.log("app started");\n',
      'src/services/userService.ts': [
        'import { UserRepository } from "../repositories/userRepository.js";',
        '',
        'export class UserService {',
        '  static async create(data: { name: string; email: string }) {',
        '    // BUG: no duplicate email check before insert',
        '    return UserRepository.create(data);',
        '  }',
        '}',
      ].join('\n'),
      'src/repositories/userRepository.ts': [
        'const users: Array<{ id: number; name: string; email: string }> = [];',
        'let nextId = 1;',
        '',
        'export class UserRepository {',
        '  static async findAll() { return users; }',
        '  static async create(data: { name: string; email: string }) {',
        '    const user = { id: nextId++, ...data };',
        '    users.push(user);',
        '    return user;',
        '  }',
        '  static async findByEmail(email: string) {',
        '    return users.find(u => u.email === email);',
        '  }',
        '}',
      ].join('\n'),
    },
    assert: async (rig) => {
      const wasInvestigatorCalled = await rig.waitForToolCall(
        'codebase_investigator',
      );
      expect(
        wasInvestigatorCalled,
        'Expected codebase_investigator to be invoked for bug investigation',
      ).toBe(true);
    },
  });

  /**
   * For trivial tasks that do not require deep investigation, the agent
   * should NOT delegate to codebase_investigator. This prevents
   * over-delegation of simple edits (mirrors the pattern in
   * subagents.eval.ts for user-defined agents).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not invoke codebase_investigator for a simple direct edit',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt: 'Change the port number in index.ts from 3000 to 8080.',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'simple-app',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
      'index.ts': [
        'import express from "express";',
        'const app = express();',
        'app.get("/", (req, res) => res.send("hello"));',
        'app.listen(3000);',
      ].join('\n'),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs() as Array<{
        toolRequest: { name: string };
      }>;

      // codebase_investigator should NOT have been invoked for this.
      expect(
        toolLogs.some((l) => l.toolRequest.name === 'codebase_investigator'),
        'codebase_investigator should NOT be invoked for a trivial edit',
      ).toBe(false);
    },
  });
});
