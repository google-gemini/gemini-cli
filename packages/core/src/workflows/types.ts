/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type StepType = 'shell' | 'prompt' | 'workflow' | 'conditional';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  variables?: Record<string, string>;
  steps: WorkflowStep[];
  category?: string;
  tags?: string[];
}

export interface WorkflowStep {
  id: string;
  type: StepType;
  name: string;
  command?: string;
  prompt?: string;
  workflow?: string;
  condition?: string;
  onError?: 'stop' | 'continue' | 'rollback';
  variables?: Record<string, string>;
}

export interface WorkflowExecution {
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'rollback';
  startedAt: number;
  completedAt?: number;
  currentStep: number;
  results: StepResult[];
  error?: string;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  timestamp: number;
}

export interface WorkflowStats {
  totalWorkflows: number;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
}
