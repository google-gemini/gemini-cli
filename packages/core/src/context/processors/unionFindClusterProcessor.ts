/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { type ConcreteNode, NodeType } from '../graph/types.js';
import { ContextWindow } from '../contextWindow.js';
import { TFIDFEmbedder } from '../embeddingService.js';
import { ClusterSummarizer } from '../clusterSummarizer.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface UnionFindClusterProcessorOptions {
  enabled?: boolean;
  mergeThreshold?: number;
  maxColdClusters?: number;
  graduateAt?: number;
  evictAt?: number;
}

export const UnionFindClusterProcessorOptionsSchema: JSONSchemaType<UnionFindClusterProcessorOptions> =
  {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', nullable: true },
      mergeThreshold: { type: 'number', nullable: true },
      maxColdClusters: { type: 'number', nullable: true },
      graduateAt: { type: 'number', nullable: true },
      evictAt: { type: 'number', nullable: true },
    },
    required: [],
  };

function extractNodeText(node: ConcreteNode): string {
  const payload = node.payload;
  if (payload.text) return payload.text;
  if (payload.functionResponse) {
    const raw = payload.functionResponse.response;
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  if (payload.functionCall) {
    return `${payload.functionCall.name}(${JSON.stringify(payload.functionCall.args)})`;
  }
  return '';
}

export function createUnionFindClusterProcessor(
  id: string,
  env: ContextEnvironment,
  options: UnionFindClusterProcessorOptions,
): ContextProcessor {
  const resolvedOptions = {
    enabled: options.enabled ?? false,
    mergeThreshold: options.mergeThreshold ?? 0.15,
    maxColdClusters: options.maxColdClusters ?? 10,
    graduateAt: options.graduateAt ?? 26,
    evictAt: options.evictAt ?? 30,
  };

  return {
    id,
    name: 'UnionFindClusterProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (!resolvedOptions.enabled) return targets;
      if (targets.length < 3) return targets;

      const embedder = new TFIDFEmbedder();
      const summarizer = new ClusterSummarizer(
        env.llmClient,
        'gemini-3-flash-base',
      );
      const contextWindow = new ContextWindow(
        embedder,
        summarizer,
        resolvedOptions,
      );
      const msgIdToNodeId = new Map<number, string>();
      const targetIndex = new Map<string, number>();
      let nextMsgId = 0;

      for (let i = 0; i < targets.length; i++) {
        const node = targets[i];
        targetIndex.set(node.id, i);
        const text = extractNodeText(node);
        if (!text) continue;

        const msgId = nextMsgId++;
        contextWindow.append(text, new Date(node.timestamp).toISOString());
        msgIdToNodeId.set(msgId, node.id);
      }

      if (contextWindow.coldClusterCount === 0) return targets;

      try {
        await contextWindow.resolveDirty();
      } catch (e) {
        debugLogger.warn('UnionFindClusterProcessor resolveDirty failed', e);
      }

      const forest = contextWindow.forest;
      const coldRoots = forest.roots();

      const clusterByNodeId = new Map<string, ConcreteNode>();
      const insertedClusters = new Set<string>();

      for (const root of coldRoots) {
        const memberMsgIds = forest.members(root);
        const memberNodeIds = memberMsgIds
          .map((mid) => msgIdToNodeId.get(mid))
          .filter(
            (nid): nid is string => nid !== undefined && targetIndex.has(nid),
          );

        if (memberNodeIds.length < 2) continue;

        const summaryText = forest.compact(root);

        const firstIdx = Math.min(
          ...memberNodeIds.map((nid) => targetIndex.get(nid)!),
        );
        const firstNode = targets[firstIdx];
        const newId = randomUUID();

        const snapshotNode: ConcreteNode = {
          id: newId,
          turnId: newId,
          type: NodeType.SNAPSHOT,
          timestamp: firstNode.timestamp,
          role: 'user',
          payload: { text: summaryText },
          abstractsIds: memberNodeIds,
        } as ConcreteNode;

        for (const nid of memberNodeIds) {
          clusterByNodeId.set(nid, snapshotNode);
        }
      }

      if (clusterByNodeId.size === 0) return targets;

      const returnedNodes: ConcreteNode[] = [];

      for (const node of targets) {
        if (clusterByNodeId.has(node.id)) {
          const cluster = clusterByNodeId.get(node.id)!;
          if (!insertedClusters.has(cluster.id)) {
            returnedNodes.push(cluster);
            insertedClusters.add(cluster.id);
          }
        } else {
          returnedNodes.push(node);
        }
      }

      return returnedNodes;
    },
  };
}
