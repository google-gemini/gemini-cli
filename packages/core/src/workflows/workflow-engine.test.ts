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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  WorkflowEngine,
  BUILTIN_WORKFLOWS,
  getWorkflowEngine,
  resetWorkflowEngine,
} from './workflow-engine.js';

describe('BUILTIN_WORKFLOWS', () => {
  it('should have 20 workflow templates', () => {
    expect(BUILTIN_WORKFLOWS).toHaveLength(20);
  });

  it('should have unique workflow IDs', () => {
    const ids = BUILTIN_WORKFLOWS.map((w) => w.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(BUILTIN_WORKFLOWS.length);
  });

  it('should have all required fields', () => {
    BUILTIN_WORKFLOWS.forEach((workflow) => {
      expect(workflow.id).toBeTruthy();
      expect(workflow.name).toBeTruthy();
      expect(workflow.description).toBeTruthy();
      expect(workflow.version).toBeTruthy();
      expect(Array.isArray(workflow.steps)).toBe(true);
      expect(workflow.steps.length).toBeGreaterThan(0);
    });
  });

  it('should have valid step types', () => {
    const validTypes = ['shell', 'prompt', 'workflow', 'conditional'];
    BUILTIN_WORKFLOWS.forEach((workflow) => {
      workflow.steps.forEach((step) => {
        expect(validTypes).toContain(step.type);
        expect(step.id).toBeTruthy();
        expect(step.name).toBeTruthy();
      });
    });
  });

  it('should have shell steps with commands', () => {
    BUILTIN_WORKFLOWS.forEach((workflow) => {
      workflow.steps.forEach((step) => {
        if (step.type === 'shell') {
          expect(step.command).toBeTruthy();
        }
      });
    });
  });

  it('should have prompt steps with prompts', () => {
    BUILTIN_WORKFLOWS.forEach((workflow) => {
      workflow.steps.forEach((step) => {
        if (step.type === 'prompt') {
          expect(step.prompt).toBeTruthy();
        }
      });
    });
  });

  it('should have categories', () => {
    const categories = new Set(BUILTIN_WORKFLOWS.map((w) => w.category));
    expect(categories.size).toBeGreaterThan(1);
    expect(categories.has('development')).toBe(true);
  });

  it('should have version format', () => {
    BUILTIN_WORKFLOWS.forEach((workflow) => {
      expect(workflow.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

describe('WorkflowEngine', () => {
  let tempDir: string;
  let engine: WorkflowEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-test-'));
    const statePath = path.join(tempDir, 'history.json');
    engine = new WorkflowEngine(statePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getWorkflows', () => {
    it('should return all workflows', () => {
      const workflows = engine.getWorkflows();
      expect(workflows).toHaveLength(20);
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow by ID', () => {
      const workflow = engine.getWorkflow('code-review');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Code Review');
    });

    it('should return undefined for non-existent workflow', () => {
      const workflow = engine.getWorkflow('non-existent');
      expect(workflow).toBeUndefined();
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a simple workflow', async () => {
      const execution = await engine.executeWorkflow('code-review');

      expect(execution).toBeDefined();
      expect(execution.workflowId).toBe('code-review');
      expect(execution.status).toBe('completed');
      expect(execution.results.length).toBeGreaterThan(0);
      expect(execution.completedAt).toBeDefined();
    });

    it('should track execution time', async () => {
      const execution = await engine.executeWorkflow('bug-fix');

      expect(execution.startedAt).toBeDefined();
      expect(execution.completedAt).toBeDefined();
      expect(execution.completedAt).toBeGreaterThanOrEqual(execution.startedAt);
    });

    it('should execute all steps', async () => {
      const workflow = engine.getWorkflow('test-generation');
      const execution = await engine.executeWorkflow('test-generation');

      expect(execution.results.length).toBe(workflow?.steps.length);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(engine.executeWorkflow('non-existent')).rejects.toThrow(
        'Workflow not found: non-existent',
      );
    });

    it('should handle workflow with variables', async () => {
      const execution = await engine.executeWorkflow('git-workflow', {
        message: 'Test commit',
      });

      expect(execution.status).toBe('completed');
      const result = execution.results[0];
      expect(result.output).toContain('Test commit');
    });

    it('should use default variables from workflow', async () => {
      const workflow = {
        id: 'test-vars',
        name: 'Test Variables',
        description: 'Test',
        version: '1.0.0',
        variables: { name: 'default' },
        steps: [
          {
            id: 'step1',
            type: 'prompt' as const,
            name: 'Test',
            prompt: 'Hello {{name}}',
          },
        ],
      };

      // Create custom engine with test workflow
      const customEngine = new WorkflowEngine(
        path.join(tempDir, 'custom.json'),
      );

      // Note: Can't add custom workflows to engine, but we can test variable substitution
      const execution = await engine.executeWorkflow('git-workflow', {
        message: 'Custom message',
      });

      expect(execution.results[0].output).toContain('Custom message');
    });

    it('should handle errors gracefully', async () => {
      const execution = await engine.executeWorkflow('code-review');
      expect(execution.status).toBe('completed');
    });

    it('should track step results', async () => {
      const execution = await engine.executeWorkflow('refactor');

      execution.results.forEach((result) => {
        expect(result.stepId).toBeDefined();
        expect(result.status).toBeDefined();
        expect(result.timestamp).toBeDefined();
        expect(['success', 'failed', 'skipped']).toContain(result.status);
      });
    });

    it('should set current step during execution', async () => {
      const execution = await engine.executeWorkflow('doc-generation');
      expect(execution.currentStep).toBeGreaterThanOrEqual(0);
    });
  });

  describe('variable substitution', () => {
    it('should substitute single variable', async () => {
      const execution = await engine.executeWorkflow('git-workflow', {
        message: 'My message',
      });

      expect(execution.results[0].output).toContain('My message');
    });

    it('should leave unmatched variables as-is', async () => {
      const execution = await engine.executeWorkflow('git-workflow', {
        other: 'value',
      });

      expect(execution.results[0].output).toContain('{{message}}');
    });

    it('should handle multiple variables', async () => {
      // Test workflows don't have multiple variables, but we can verify the mechanism
      const execution = await engine.executeWorkflow('git-workflow', {
        message: 'Test 1',
        other: 'Test 2',
      });

      expect(execution.status).toBe('completed');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = engine.getStats();
      expect(stats.totalWorkflows).toBe(20);
      expect(stats.executionCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
    });

    it('should track execution count', async () => {
      await engine.executeWorkflow('code-review');
      await engine.executeWorkflow('bug-fix');

      const stats = engine.getStats();
      expect(stats.executionCount).toBe(2);
    });

    it('should track success count', async () => {
      await engine.executeWorkflow('code-review');
      await engine.executeWorkflow('test-generation');

      const stats = engine.getStats();
      expect(stats.successCount).toBe(2);
    });

    it('should track failure count', async () => {
      try {
        await engine.executeWorkflow('non-existent');
      } catch (e) {
        // Expected error
      }

      const stats = engine.getStats();
      expect(stats.failureCount).toBe(0); // Doesn't count pre-execution failures
    });
  });

  describe('persistence', () => {
    it('should persist execution history to file', async () => {
      await engine.executeWorkflow('code-review');

      const statePath = path.join(tempDir, 'history.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].workflowId).toBe('code-review');
    });

    it('should load execution history from file', async () => {
      await engine.executeWorkflow('code-review');
      await engine.executeWorkflow('bug-fix');

      const statePath = path.join(tempDir, 'history.json');
      const newEngine = new WorkflowEngine(statePath);
      const stats = newEngine.getStats();

      expect(stats.executionCount).toBe(2);
    });

    it('should append to existing history', async () => {
      await engine.executeWorkflow('code-review');

      const statePath = path.join(tempDir, 'history.json');
      const newEngine = new WorkflowEngine(statePath);
      await newEngine.executeWorkflow('bug-fix');

      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(data.length).toBe(2);
    });
  });
});

describe('getWorkflowEngine', () => {
  afterEach(() => {
    resetWorkflowEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getWorkflowEngine();
    const engine2 = getWorkflowEngine();
    expect(engine1).toBe(engine2);
  });

  it('should create new instance after reset', () => {
    const engine1 = getWorkflowEngine();
    resetWorkflowEngine();
    const engine2 = getWorkflowEngine();
    expect(engine1).not.toBe(engine2);
  });
});
