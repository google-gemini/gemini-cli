/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs, BackstopTargetOptions, ContextWorker } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { ConcreteNode, Snapshot } from '../ir/types.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface StateSnapshotProcessorOptions extends BackstopTargetOptions {
  model?: string;
  systemInstruction?: string;
}

export class StateSnapshotProcessor implements ContextProcessor, ContextWorker {
  static create(
    env: ContextEnvironment,
    options: StateSnapshotProcessorOptions,
  ): StateSnapshotProcessor {
    return new StateSnapshotProcessor(env, options);
  }

  readonly id = 'StateSnapshotProcessor';
  readonly name = 'StateSnapshotProcessor';
  readonly options: StateSnapshotProcessorOptions;
  private readonly env: ContextEnvironment;

  // As a worker, we trigger when nodes are added to proactively accumulate
  readonly triggers = {
    onNodesAdded: true,
  };

  constructor(env: ContextEnvironment, options: StateSnapshotProcessorOptions) {
    this.env = env;
    this.options = options;
  }

  // --- ContextWorker Interface (Proactive Accumulation) ---
  async execute({ targets: _targets, inbox: _inbox }: { targets: readonly ConcreteNode[]; inbox: import('../pipeline.js').InboxSnapshot }): Promise<void> {
    
    // We only care about nodes that have aged out past retainedTokens
    // To calculate this precisely, we'd need the ContextAccountingState, but for V0
    // the Orchestrator doesn't pass state to workers. We will assume the Orchestrator
    // passes ONLY the "aged out" targets to the worker if triggered by onNodesAdded
    // OR we just look for un-snapshotted nodes.
    
    // For V0: Let's simply wait until the Pipeline invokes the Processor synchronously.
    // Building the robust progressively accumulating worker requires the Orchestrator 
    // to pass ContextAccountingState to the `execute` method, which we can add later.
  }

  // --- ContextProcessor Interface (Sync Backstop / Cache Application) ---
  async process({ targets, state, inbox }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    if (state.isBudgetSatisfied) {
      return targets;
    }

    // 1. Check Inbox for a completed Snapshot (The Fast Path)
    const proposedSnapshots = inbox.getMessages<{ newText: string; consumedIds: string[] }>('PROPOSED_SNAPSHOT');
    
    if (proposedSnapshots.length > 0) {
      // Sort by newest timestamp first (we want the most accumulated snapshot)
      const sorted = [...proposedSnapshots].sort((a, b) => b.timestamp - a.timestamp);
      
      for (const proposed of sorted) {
        const { consumedIds, newText } = proposed.payload;
        
        // Verify all consumed IDs still exist sequentially in targets
        const targetIds = new Set(targets.map(t => t.id));
        const isValid = consumedIds.every(id => targetIds.has(id));
        
        if (isValid) {
          // If valid, apply it!
          const newId = this.env.idGenerator.generateId();
          
          const snapshotNode: Snapshot = {
            id: newId,
            logicalParentId: newId,
            type: 'SNAPSHOT',
            timestamp: Date.now(),
            text: newText,
          };

          // Remove the consumed nodes and insert the snapshot at the earliest index
          const returnedNodes = targets.filter(t => !consumedIds.includes(t.id));
          const firstRemovedIdx = targets.findIndex(t => consumedIds.includes(t.id));
          
          if (firstRemovedIdx !== -1) {
             const idx = Math.max(0, firstRemovedIdx);
             returnedNodes.splice(idx, 0, snapshotNode);
          } else {
             returnedNodes.unshift(snapshotNode);
          }

          inbox.consume(proposed.id);
          return returnedNodes;
        }
      }
    }

    // 2. The Synchronous Backstop (The Slow Path)
    const strategy = this.options.target ?? "max";
    let targetTokensToRemove = 0;

    if (strategy === 'incremental') {
       targetTokensToRemove = state.deficitTokens;
    } else if (strategy === 'freeNTokens') {
       targetTokensToRemove = this.options.freeTokensTarget ?? state.deficitTokens;
    } else if (strategy === 'max') {
       targetTokensToRemove = Infinity;
    }

    let deficitAccumulator = 0;
    const nodesToSummarize: ConcreteNode[] = [];

    // Scan oldest to newest
    for (const node of targets) {
      if (node.id === targets[0].id && node.type === 'USER_PROMPT') {
          // Keep system prompt if it's the very first node
          // In a real system, system prompt is protected, but we double check
          continue; 
      }
      
      nodesToSummarize.push(node);
      deficitAccumulator += this.env.tokenCalculator.getTokenCost(node);

      if (deficitAccumulator >= targetTokensToRemove) break;
    }

    if (nodesToSummarize.length < 2) return targets; // Not enough context

    try {
       const snapshotText = await this.synthesizeSnapshot(nodesToSummarize);
       const newId = this.env.idGenerator.generateId();
       const tokens = this.env.tokenCalculator.estimateTokensForString(snapshotText);
       const snapshotNode: Snapshot = {
            id: newId,
            logicalParentId: newId,
            type: 'SNAPSHOT',
            timestamp: Date.now(),
            text: snapshotText,
       };

       const consumedIds = nodesToSummarize.map(n => n.id);
       const returnedNodes = targets.filter(t => !consumedIds.includes(t.id));
       const firstRemovedIdx = targets.findIndex(t => consumedIds.includes(t.id));
       
       if (firstRemovedIdx !== -1) {
           const idx = Math.max(0, firstRemovedIdx);
           returnedNodes.splice(idx, 0, snapshotNode);
       } else {
           returnedNodes.unshift(snapshotNode);
       }

       return returnedNodes;

    } catch (e) {
       debugLogger.error('StateSnapshotProcessor failed sync backstop', e);
       return targets;
    }
  }

  private async synthesizeSnapshot(nodes: ConcreteNode[]): Promise<string> {
    const systemPrompt =
      this.options.systemInstruction ??
      `You are an expert Context Memory Manager. You will be provided with a raw transcript of older conversation turns between a user and an AI assistant.
Your task is to synthesize these turns into a single, dense, factual snapshot that preserves all critical context, preferences, active tasks, and factual knowledge, but discards conversational filler, pleasantries, and redundant back-and-forth iterations.

Output ONLY the raw factual snapshot, formatted compactly. Do not include markdown wrappers, prefixes like "Here is the snapshot", or conversational elements.`;

    let userPromptText = 'TRANSCRIPT TO SNAPSHOT:\n\n';
    for (const node of nodes) {
        let nodeContent = '';
        if ('text' in node && typeof node.text === 'string') {
            nodeContent = node.text;
        } else if ('semanticParts' in node) {
            nodeContent = JSON.stringify(node.semanticParts);
        } else if ('observation' in node) {
            nodeContent = typeof node.observation === 'string' ? node.observation : JSON.stringify(node.observation);
        }
        
        userPromptText += `[${node.type}]: ${nodeContent}\n`;
    }

    const response = await this.env.llmClient.generateContent({
        role: 'utility_state_snapshot_processr' as import('../../telemetry/llmRole.js').LlmRole,
        modelConfigKey: { model: 'default' },
        contents: [{ role: 'user', parts: [{ text: userPromptText }] }],
        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        promptId: this.env.promptId,
        abortSignal: new AbortController().signal,
    });

    return response.text || '';
  }
}
