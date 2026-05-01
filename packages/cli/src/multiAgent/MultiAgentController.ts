/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MultiAgentRole } from './nonInteractiveMultiAgent.js';

export type MultiAgentState =
  | 'idle'
  | 'planning'
  | 'researching'
  | 'coding'
  | 'testing'
  | 'reviewing'
  | 'blocked'
  | 'cancelled'
  | 'done';

export type MultiAgentEventType =
  | 'state_changed'
  | 'role_started'
  | 'role_finished'
  | 'role_skipped'
  | 'blocked'
  | 'cancelled'
  | 'done';

export interface MultiAgentSnapshot {
  state: MultiAgentState;
  roles: MultiAgentRole[];
  currentRole?: MultiAgentRole;
  completedRoles: MultiAgentRole[];
  skippedRoles: MultiAgentRole[];
  blockedReason?: string;
  isRunning: boolean;
  isCancellationRequested: boolean;
}

export interface MultiAgentEvent {
  type: MultiAgentEventType;
  snapshot: MultiAgentSnapshot;
  role?: MultiAgentRole;
  message?: string;
}

export type MultiAgentListener = (event: MultiAgentEvent) => void;

export interface MultiAgentControllerOptions {
  roles: MultiAgentRole[];
}

const ROLE_TO_STATE: Record<MultiAgentRole, MultiAgentState> = {
  planner: 'planning',
  researcher: 'researching',
  coder: 'coding',
  tester: 'testing',
  reviewer: 'reviewing',
};

/**
 * State-only controller for interactive multi-agent orchestration.
 *
 * This class deliberately does not call model APIs or execute tools. It owns the
 * lifecycle that the Ink UI and future slash commands can observe/control while
 * preserving the existing Config, scheduler, policy, approval, and sandbox
 * execution paths.
 */
export class MultiAgentController {
  private readonly roles: MultiAgentRole[];
  private readonly listeners = new Set<MultiAgentListener>();
  private completedRoles: MultiAgentRole[] = [];
  private skippedRoles: MultiAgentRole[] = [];
  private currentRole: MultiAgentRole | undefined;
  private state: MultiAgentState = 'idle';
  private blockedReason: string | undefined;
  private cancellationRequested = false;

  constructor(options: MultiAgentControllerOptions) {
    this.roles = [...new Set(options.roles)];
  }

  subscribe(listener: MultiAgentListener): () => void {
    this.listeners.add(listener);
    listener({
      type: 'state_changed',
      snapshot: this.getSnapshot(),
    });
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MultiAgentSnapshot {
    return {
      state: this.state,
      roles: [...this.roles],
      currentRole: this.currentRole,
      completedRoles: [...this.completedRoles],
      skippedRoles: [...this.skippedRoles],
      blockedReason: this.blockedReason,
      isRunning: this.isRunning(),
      isCancellationRequested: this.cancellationRequested,
    };
  }

  start(): void {
    if (this.isRunning()) {
      return;
    }

    this.completedRoles = [];
    this.skippedRoles = [];
    this.currentRole = undefined;
    this.blockedReason = undefined;
    this.cancellationRequested = false;
    this.state = 'idle';
    this.emit('state_changed');
  }

  startRole(role: MultiAgentRole): void {
    this.assertKnownRole(role);
    if (this.cancellationRequested) {
      this.state = 'cancelled';
      this.emit('cancelled', role, 'Cancellation requested before role start.');
      return;
    }

    this.currentRole = role;
    this.blockedReason = undefined;
    this.state = ROLE_TO_STATE[role];
    this.emit('role_started', role);
  }

  finishRole(role: MultiAgentRole): void {
    this.assertKnownRole(role);
    if (this.currentRole !== role) {
      throw new Error(
        `Cannot finish role "${role}" because current role is "${
          this.currentRole ?? 'none'
        }".`,
      );
    }

    if (!this.completedRoles.includes(role)) {
      this.completedRoles.push(role);
    }
    this.currentRole = undefined;
    this.state = this.cancellationRequested ? 'cancelled' : 'idle';
    this.emit('role_finished', role);
  }

  skipRole(role: MultiAgentRole): void {
    this.assertKnownRole(role);
    if (!this.skippedRoles.includes(role)) {
      this.skippedRoles.push(role);
    }
    if (this.currentRole === role) {
      this.currentRole = undefined;
      this.state = 'idle';
    }
    this.emit('role_skipped', role);
  }

  block(reason: string): void {
    this.blockedReason = reason;
    this.state = 'blocked';
    this.emit('blocked', this.currentRole, reason);
  }

  cancel(message = 'Multi-agent run cancelled.'): void {
    this.cancellationRequested = true;
    this.currentRole = undefined;
    this.state = 'cancelled';
    this.emit('cancelled', undefined, message);
  }

  complete(): void {
    this.currentRole = undefined;
    this.state = this.cancellationRequested ? 'cancelled' : 'done';
    this.emit(this.state === 'done' ? 'done' : 'cancelled');
  }

  nextPendingRole(): MultiAgentRole | undefined {
    return this.roles.find(
      (role) =>
        !this.completedRoles.includes(role) &&
        !this.skippedRoles.includes(role),
    );
  }

  isRunning(): boolean {
    return !['idle', 'blocked', 'cancelled', 'done'].includes(this.state);
  }

  private assertKnownRole(role: MultiAgentRole): void {
    if (!this.roles.includes(role)) {
      throw new Error(`Unknown multi-agent role "${role}".`);
    }
  }

  private emit(
    type: MultiAgentEventType,
    role?: MultiAgentRole,
    message?: string,
  ): void {
    const event: MultiAgentEvent = {
      type,
      role,
      message,
      snapshot: this.getSnapshot(),
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
