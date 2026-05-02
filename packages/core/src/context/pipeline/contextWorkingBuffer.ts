/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextWorkingBuffer, GraphMutation } from '../pipeline.js';
import type { ConcreteNode } from '../graph/types.js';

export class ContextWorkingBufferImpl implements ContextWorkingBuffer {
  // The current active graph
  readonly nodes: readonly ConcreteNode[];

  // The AOT pre-calculated provenance index (Current ID -> Pristine IDs)
  private readonly provenanceMap: ReadonlyMap<string, ReadonlySet<string>>;

  // The original immutable pristine nodes mapping
  private readonly pristineNodesMap: ReadonlyMap<string, ConcreteNode>;

  // The historical linked list of changes
  private readonly history: readonly GraphMutation[];

  private constructor(
    nodes: readonly ConcreteNode[],
    pristineNodesMap: ReadonlyMap<string, ConcreteNode>,
    provenanceMap: ReadonlyMap<string, ReadonlySet<string>>,
    history: readonly GraphMutation[],
  ) {
    this.nodes = nodes;
    this.pristineNodesMap = pristineNodesMap;
    this.provenanceMap = provenanceMap;
    this.history = history;
  }

  /**
   * Initializes a brand new ContextWorkingBuffer from a pristine graph.
   * Every node's provenance points to itself.
   */
  static initialize(
    pristineNodes: readonly ConcreteNode[],
  ): ContextWorkingBufferImpl {
    const pristineMap = new Map<string, ConcreteNode>();
    const initialProvenance = new Map<string, ReadonlySet<string>>();

    for (const node of pristineNodes) {
      pristineMap.set(node.id, node);
      initialProvenance.set(node.id, new Set([node.id]));
    }

    return new ContextWorkingBufferImpl(
      pristineNodes,
      pristineMap,
      initialProvenance,
      [], // Empty history
    );
  }

  /**
   * Appends newly observed pristine nodes (e.g. from a user message) to the working buffer.
   * Ensures they are tracked in the pristine map and point to themselves in provenance.
   */
  appendPristineNodes(
    newNodes: readonly ConcreteNode[],
  ): ContextWorkingBufferImpl {
    if (newNodes.length === 0) return this;

    const newPristineMap = new Map<string, ConcreteNode>(this.pristineNodesMap);
    const newProvenanceMap = new Map(this.provenanceMap);
    const existingIds = new Set(this.nodes.map((n) => n.id));

    const nodesToAdd: ConcreteNode[] = [];
    const batchIds = new Set<string>();
    for (const node of newNodes) {
      if (!existingIds.has(node.id) && !batchIds.has(node.id)) {
        newPristineMap.set(node.id, node);
        newProvenanceMap.set(node.id, new Set([node.id]));
        nodesToAdd.push(node);
        batchIds.add(node.id);
      }
    }

    if (nodesToAdd.length === 0) return this;

    return new ContextWorkingBufferImpl(
      [...this.nodes, ...nodesToAdd],
      newPristineMap,
      newProvenanceMap,
      [...this.history],
    );
  }

  /**
   * Generates an entirely new buffer instance by calculating the delta between the processor's input and output.
   */
  applyProcessorResult(
    processorId: string,
    inputTargets: readonly ConcreteNode[],
    outputNodes: readonly ConcreteNode[],
  ): ContextWorkingBufferImpl {
    const outputIds = new Set(outputNodes.map((n) => n.id));
    const inputIds = new Set(inputTargets.map((n) => n.id));

    // Calculate diffs
    const removedIds = inputTargets
      .filter((n) => !outputIds.has(n.id))
      .map((n) => n.id);
    const addedNodes = outputNodes.filter((n) => !inputIds.has(n.id));

    // Create mutation record
    const mutation: GraphMutation = {
      processorId,
      timestamp: Date.now(),
      removedIds,
      addedNodes,
    };

    // Calculate new node array
    const removedSet = new Set(removedIds);

    const newGraph = this.nodes.filter((n) => !removedSet.has(n.id));
    const insertionIndex = this.nodes.findIndex((n) => removedSet.has(n.id));

    // IMPORTANT: We do NOT use structuredClone here.
    // The ContextTokenCalculator relies on a WeakMap tied to exact object references
    // for O(1) performance. Deep cloning would cause catastrophic cache misses.
    // The pipeline enforces immutability, making reference passing safe.
    if (insertionIndex !== -1) {
      newGraph.splice(insertionIndex, 0, ...addedNodes);
    } else {
      newGraph.push(...addedNodes);
    }

    // Calculate new provenance map
    const newProvenanceMap = new Map(this.provenanceMap);

    let finalPristineMap = this.pristineNodesMap;

    // Map the new synthetic nodes back to their pristine roots
    for (const added of addedNodes) {
      const roots = new Set<string>();

      // 1:1 Replacement (e.g. Masked Node)
      if (added.replacesId) {
        const inheritedRoots = this.provenanceMap.get(added.replacesId);
        if (inheritedRoots) {
          for (const rootId of inheritedRoots) roots.add(rootId);
        }
      }

      // N:1 Abstraction (e.g. Rolling Summary)
      if (added.abstractsIds) {
        for (const abstractId of added.abstractsIds) {
          const inheritedRoots = this.provenanceMap.get(abstractId);
          if (inheritedRoots) {
            for (const rootId of inheritedRoots) roots.add(rootId);
          }
        }
      }

      // If it has no links back to the original graph, it is its own root
      // (e.g., a system-injected instruction)
      if (roots.size === 0) {
        roots.add(added.id);
        // It acts as a net-new pristine root.
        if (!finalPristineMap.has(added.id)) {
          const mutableMap = new Map<string, ConcreteNode>(finalPristineMap);
          mutableMap.set(added.id, added);
          finalPristineMap = mutableMap;
        }
      }

      newProvenanceMap.set(added.id, roots);
    }

    // GC the Caches
    // We only want to keep provenance and pristine entries that are reachable
    // from the nodes in 'newGraph'.
    const reachablePristineIds = new Set<string>();
    const reachableCurrentIds = new Set<string>();

    for (const node of newGraph) {
      reachableCurrentIds.add(node.id);
      const roots = newProvenanceMap.get(node.id);
      if (roots) {
        for (const root of roots) {
          reachablePristineIds.add(root);
        }
      }
    }

    // Prune Provenance Map
    for (const [id] of newProvenanceMap) {
      if (!reachableCurrentIds.has(id)) {
        newProvenanceMap.delete(id);
      }
    }

    // Prune Pristine Map
    const prunedPristineMap = new Map<string, ConcreteNode>();
    for (const id of reachablePristineIds) {
      const node = finalPristineMap.get(id);
      if (node) prunedPristineMap.set(id, node);
    }
    finalPristineMap = prunedPristineMap;

    return new ContextWorkingBufferImpl(
      newGraph,
      finalPristineMap,
      newProvenanceMap,
      [...this.history, mutation],
    );
  }

  /** Removes nodes from the working buffer that were completely dropped from the upstream pristine history */
  prunePristineNodes(
    retainedIds: ReadonlySet<string>,
  ): ContextWorkingBufferImpl {
    const newGraph = this.nodes.filter(
      (n) => retainedIds.has(n.id) || !this.pristineNodesMap.has(n.id),
    );

    const newProvenanceMap = new Map(this.provenanceMap);
    const reachablePristineIds = new Set<string>();
    const reachableCurrentIds = new Set<string>();

    for (const node of newGraph) {
      reachableCurrentIds.add(node.id);
      const roots = newProvenanceMap.get(node.id);
      if (roots) {
        for (const root of roots) {
          if (retainedIds.has(root) || !this.pristineNodesMap.has(root)) {
            reachablePristineIds.add(root);
          }
        }
      }
    }

    for (const [id] of newProvenanceMap) {
      if (!reachableCurrentIds.has(id)) {
        newProvenanceMap.delete(id);
      }
    }

    const prunedPristineMap = new Map<string, ConcreteNode>();
    for (const id of reachablePristineIds) {
      const node = this.pristineNodesMap.get(id);
      if (node) prunedPristineMap.set(id, node);
    }

    return new ContextWorkingBufferImpl(
      newGraph,
      prunedPristineMap,
      newProvenanceMap,
      [...this.history],
    );
  }

  getPristineNodes(id: string): readonly ConcreteNode[] {
    const pristineIds = this.provenanceMap.get(id);
    if (!pristineIds) return [];
    return Array.from(pristineIds).map(
      (pid) => this.pristineNodesMap.get(pid)!,
    );
  }

  getAuditLog(): readonly GraphMutation[] {
    return this.history;
  }
}
