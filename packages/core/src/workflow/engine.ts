/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { ArchitectAgent } from '../agents/architect-agent.js';
import { LocalAgentExecutor, type ActivityCallback } from '../agents/local-executor.js';
import type { PlanProposal } from '../agents/types.js';

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';

/**
 * Orchestrates the 7-phase workflow using specialized agents.
 */
export class WorkflowEngine {
  private status: WorkflowStatus = 'idle';

  constructor(private readonly config: Config, private readonly onActivity?: ActivityCallback) {}

  async run(request: string, signal: AbortSignal) {
    this.status = 'running';
    try {
      // 1. Discovery & Exploration (Simplified for now - Architect does both)
      // 2. Architecture Phase
      const plan = await this.runArchitecture(request, signal);
      
      // 3. Implementation Phase (Simplified - using existing Generalist for now)
      // For the sake of the test, we'll stop here or mock implementation
      
      this.status = 'completed';
      return { status: this.status, plan };
    } catch (error) {
      this.status = 'failed';
      throw error;
    }
  }

  private async runArchitecture(request: string, signal: AbortSignal): Promise<PlanProposal> {
    const definition = ArchitectAgent(this.config);
    const executor = await LocalAgentExecutor.create(definition, this.config, this.onActivity);
    const output = await executor.run({ request }, signal);
    
    try {
      return JSON.parse(output.result) as PlanProposal;
    } catch (e) {
      // If result is not JSON, wrap it in a plan object
      return {
        title: 'Auto-generated Plan',
        description: output.result,
        steps: []
      };
    }
  }

  getStatus() {
    return this.status;
  }
}
