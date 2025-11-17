/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Workflow, WorkflowExecution, StepResult, WorkflowStats } from './types.js';
import { BUILTIN_WORKFLOWS } from './templates.js';

function getWorkflowStatePath(): string {
  return path.join(os.homedir(), '.gemini-cli', 'workflow-history.json');
}

export class WorkflowEngine {
  private executions: WorkflowExecution[] = [];
  private statePath: string;

  constructor(statePath?: string) {
    this.statePath = statePath || getWorkflowStatePath();
    this.loadHistory();
  }

  getWorkflows(): Workflow[] {
    return BUILTIN_WORKFLOWS;
  }

  getWorkflow(id: string): Workflow | undefined {
    return BUILTIN_WORKFLOWS.find((w) => w.id === id);
  }

  async executeWorkflow(workflowId: string, variables?: Record<string, string>): Promise<WorkflowExecution> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const execution: WorkflowExecution = {
      workflowId,
      status: 'running',
      startedAt: Date.now(),
      currentStep: 0,
      results: [],
    };

    try {
      const mergedVars = { ...workflow.variables, ...variables };
      
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        execution.currentStep = i;

        const result = await this.executeStep(step, mergedVars);
        execution.results.push(result);

        if (result.status === 'failed' && step.onError === 'stop') {
          execution.status = 'failed';
          execution.error = result.error;
          break;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
    }

    execution.completedAt = Date.now();
    this.executions.push(execution);
    this.saveHistory();

    return execution;
  }

  private async executeStep(step: any, variables: Record<string, string>): Promise<StepResult> {
    const result: StepResult = {
      stepId: step.id,
      status: 'success',
      timestamp: Date.now(),
    };

    try {
      if (step.type === 'shell') {
        const command = this.substituteVariables(step.command || '', variables);
        result.output = `Would execute: ${command}`;
      } else if (step.type === 'prompt') {
        const prompt = this.substituteVariables(step.prompt || '', variables);
        result.output = `Would send prompt: ${prompt}`;
      }
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
    }

    return result;
  }

  private substituteVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
  }

  getStats(): WorkflowStats {
    return {
      totalWorkflows: BUILTIN_WORKFLOWS.length,
      executionCount: this.executions.length,
      successCount: this.executions.filter((e) => e.status === 'completed').length,
      failureCount: this.executions.filter((e) => e.status === 'failed').length,
      averageDuration: 0,
    };
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        this.executions = data;
      }
    } catch (error) {
      console.error('Failed to load workflow history:', error);
    }
  }

  private saveHistory(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.executions, null, 2));
    } catch (error) {
      console.error('Failed to save workflow history:', error);
    }
  }
}

let engineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engineInstance) {
    engineInstance = new WorkflowEngine();
  }
  return engineInstance;
}

export function resetWorkflowEngine(): void {
  engineInstance = null;
}
