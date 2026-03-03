/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { SubagentProgress } from '../agents/types.js';

export interface BackgroundAgent {
  id: string;
  name: string;
  displayName: string;
  command: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  output: SubagentProgress;
  startTime: number;
  endTime?: number;
  exitCode?: number; // Not applicable for agents, but keeping consistent with shell if needed
}

export type BackgroundAgentEvent =
  | { type: 'added'; agent: BackgroundAgent }
  | { type: 'updated'; agent: BackgroundAgent }
  | { type: 'removed'; id: string };

/**
 * Service to manage agents running in the background.
 */
export class BackgroundAgentService extends EventEmitter {
  private static instance: BackgroundAgentService;
  private agents = new Map<string, BackgroundAgent>();

  private constructor() {
    super();
  }

  static getInstance(): BackgroundAgentService {
    if (!BackgroundAgentService.instance) {
      BackgroundAgentService.instance = new BackgroundAgentService();
    }
    return BackgroundAgentService.instance;
  }

  registerAgent(agent: Omit<BackgroundAgent, 'status' | 'startTime'>): void {
    const newAgent: BackgroundAgent = {
      ...agent,
      status: 'running',
      startTime: Date.now(),
    };
    this.agents.set(agent.id, newAgent);
    this.emit('event', { type: 'added', agent: newAgent });
  }

  updateAgentProgress(id: string, progress: SubagentProgress): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.output = progress;
      if (progress.state) {
        agent.status = progress.state;
      }
      if (agent.status !== 'running') {
        agent.endTime = Date.now();
      }
      this.emit('event', { type: 'updated', agent });
    }
  }

  getAgent(id: string): BackgroundAgent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): BackgroundAgent[] {
    return Array.from(this.agents.values());
  }

  removeAgent(id: string): void {
    if (this.agents.has(id)) {
      this.agents.delete(id);
      this.emit('event', { type: 'removed', id });
    }
  }

  killAgent(id: string): void {
    // This will be implemented by the caller (LocalSubagentInvocation)
    // using the AbortController.
    // Here we just update the status if it's still running.
    const agent = this.agents.get(id);
    if (agent && agent.status === 'running') {
      agent.status = 'cancelled';
      agent.endTime = Date.now();
      this.emit('event', { type: 'updated', agent });
    }
  }

  onEvent(handler: (event: BackgroundAgentEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}
