/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SnapshotProposal, SnapshotCache } from '../pipeline.js';

export class LiveSnapshotCache implements SnapshotCache {
  private proposals: SnapshotProposal[] = [];
  private consumedIds = new Set<string>();

  publish(
    proposal: Omit<SnapshotProposal, 'id' | 'timestamp'>,
    idGenerator: { generateId(): string },
  ): void {
    this.proposals.push({
      ...proposal,
      id: idGenerator.generateId(),
      timestamp: Date.now(),
    });
  }

  getProposals(): readonly SnapshotProposal[] {
    return this.proposals.filter((p) => !this.consumedIds.has(p.id));
  }

  consume(proposalId: string): void {
    this.consumedIds.add(proposalId);
  }
}
