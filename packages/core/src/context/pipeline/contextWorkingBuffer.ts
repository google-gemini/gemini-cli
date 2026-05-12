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

  /**
   * Rebuilds the working buffer in the exact chronological order of the authoritative pristine history,
   * while preserving injected/summarized nodes at their relative positions.
   */
  syncPristineHistory(
    authoritativePristineNodes: readonly ConcreteNode[],
  ): ContextWorkingBufferImpl {
    const newPristineMap = new Map<string, ConcreteNode>(this.pristineNodesMap);
    const newProvenanceMap = new Map(this.provenanceMap);

    const authoritativeIds = new Set(
      authoritativePristineNodes.map((n) => n.id),
    );

    // 1. Register any newly discovered pristine nodes
    for (const node of authoritativePristineNodes) {
      if (!newPristineMap.has(node.id)) {
        newPristineMap.set(node.id, node);
        newProvenanceMap.set(node.id, new Set([node.id]));
      }
    }

    // 2. Identify surviving current nodes
    // A node survives if it's not a pristine node (e.g. summary)
    // OR if it IS a pristine node and it's in the authoritative list
    // OR if it's an injected node (it has no provenance roots).
    const survivingCurrentNodes = this.nodes
      .filter((n) => {
        if (authoritativeIds.has(n.id)) return true;
        if (!this.pristineNodesMap.has(n.id)) return true;

        // If it's in pristineNodesMap but NOT in authoritativeIds,
        // it only survives if it has no roots (e.g. it was system-injected).
        const roots = newProvenanceMap.get(n.id);
        return !roots || roots.size === 0;
      })
      .filter((n) => {
        // Additional check for non-pristine nodes: they only survive if ALL their pristine roots survive.
        // E.g., if a mutated node 'm2' roots back to 'p2', and 'p2' is dropped from authoritativeIds, 'm2' must also drop.
        if (!authoritativeIds.has(n.id) && !this.pristineNodesMap.has(n.id)) {
          const roots = newProvenanceMap.get(n.id);
          if (roots && roots.size > 0) {
            for (const root of roots) {
              if (!authoritativeIds.has(root)) {
                return false; // At least one root was dropped
              }
            }
          }
        }
        return true;
      });

    // Build a set of all pristine roots that are explicitly "covered" by the surviving nodes
    // (so we don't accidentally re-add the original pristine node if it's already been mutated/summarized).
    const coveredPristineIds = new Set<string>();
    for (const node of survivingCurrentNodes) {
      if (!authoritativeIds.has(node.id)) {
        // This is a mutated/summarized node
        const roots = newProvenanceMap.get(node.id);
        if (roots) {
          for (const root of roots) {
            coveredPristineIds.add(root);
          }
        }
      }
    }

    // 3. Weave the authoritative nodes with the surviving current nodes.
    const pristineIndexMap = new Map(
      authoritativePristineNodes.map((n, idx) => [n.id, idx]),
    );

    const getPristineIndex = (nodeId: string): number => {
      const roots = newProvenanceMap.get(nodeId);
      if (!roots || roots.size === 0) return -1;
      // For summaries, position them based on their LATEST pristine root
      let maxIndex = -1;
      for (const root of roots) {
        const idx = pristineIndexMap.get(root);
        if (idx !== undefined && idx > maxIndex) {
          maxIndex = idx;
        }
      }
      return maxIndex;
    };

    const nodeOrder = new Array<{
      node: ConcreteNode;
      sortKey: number;
      originalIndex: number;
    }>();

    // Add authoritative nodes (if they aren't covered by a mutated version)
    for (let i = 0; i < authoritativePristineNodes.length; i++) {
      const node = authoritativePristineNodes[i];
      if (!coveredPristineIds.has(node.id)) {
        nodeOrder.push({ node, sortKey: i, originalIndex: -1 }); // Pristine nodes have absolute position
      }
    }

    // Add surviving non-pristine nodes and injected nodes
    for (let i = 0; i < survivingCurrentNodes.length; i++) {
      const node = survivingCurrentNodes[i];
      if (!authoritativeIds.has(node.id)) {
        const baseSortKey = getPristineIndex(node.id);
        nodeOrder.push({
          node,
          sortKey: baseSortKey === -1 ? -1 : baseSortKey + 0.5, // Interleave after pristine roots, or at start if injected
          originalIndex: i,
        });
      }
    }

    // Sort
    nodeOrder.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      // Tiebreak: preserve original order among nodes sharing the same pristine anchor
      return a.originalIndex - b.originalIndex;
    });

    const newGraph = nodeOrder.map((item) => item.node);

    // 4. GC caches
    const reachablePristineIds = new Set<string>();
    const reachableCurrentIds = new Set<string>();

    for (const node of newGraph) {
      reachableCurrentIds.add(node.id);
      const roots = newProvenanceMap.get(node.id);
      if (roots) {
        for (const root of roots) {
          if (authoritativeIds.has(root) || !this.pristineNodesMap.has(root)) {
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
      const node = newPristineMap.get(id);
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
