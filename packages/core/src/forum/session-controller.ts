/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type {
  ForumControllerCallbacks,
  ForumMemberActivity,
  ForumMemberRole,
  ForumMemberRoundResult,
  ForumMemberState,
  ForumPreset,
  ForumPresetMember,
  ForumSessionOptions,
  ForumSessionSnapshot,
  ForumTranscriptEntry,
} from './types.js';
import { PersistentForumMemberSession } from './member-session.js';
import type { LocalAgentDefinition } from '../agents/types.js';
import type { ModelConfig } from '../services/modelConfigService.js';
import { getModelConfigAlias } from '../agents/registry.js';
import { isAutoModel } from '../config/models.js';
import { ModelConfigService } from '../services/modelConfigService.js';

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_MIN_DISCUSSION_ROUNDS = 2;

const FORUM_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
};

interface ForumMemberRuntime {
  presetMember: ForumPresetMember;
  session: PersistentForumMemberSession;
  state: ForumMemberState;
  deliveredCursor: number;
  active: boolean;
  needsAttention: boolean;
  postCount: number;
  readyToConclude: boolean;
  processedSteerVersion: number;
  scheduledSteerVersion: number;
  consecutiveErrors: number;
}

/**
 * Maximum number of consecutive non-abort errors a single member may incur
 * before the controller retires them from the forum. Transient AbortErrors
 * (deadline timeouts, user-initiated stops) do not count toward this budget.
 */
const MAX_CONSECUTIVE_MEMBER_ERRORS = 3;

function mergeModelConfig(
  base: ModelConfig,
  override?: ModelConfig,
): ModelConfig {
  if (!override) {
    return base;
  }

  return ModelConfigService.merge(base, override);
}

function buildRolePrompt(label: string, role: ForumMemberRole): string {
  if (role === 'synthesizer') {
    return `# Forum Role
You are ${label}, the final synthesizer for this forum.
When you are invoked for synthesis, read the forum transcript and produce the final proposal with \`forum_post\`.
Your final post should include the recommended approach, key tradeoffs, and any open risks.`;
  }

  return `# Forum Role
You are ${label}, one of several parallel investigators in a shared forum.
Whenever new public forum messages arrive, continue your investigation and publish one concise but substantive update with \`forum_post\`.
Use \`readyToConclude: true\` only when you believe the group has enough evidence to move to final synthesis.`;
}

function formatTranscriptEntries(
  entries: ForumTranscriptEntry[],
  memberId?: string,
): string {
  const visible = entries.filter((entry) => {
    if (entry.kind === 'system' || entry.kind === 'activity') {
      return false;
    }
    if (entry.kind === 'agent' && entry.memberId === memberId) {
      return false;
    }
    return true;
  });

  if (visible.length === 0) {
    return 'No new public forum messages.';
  }

  return visible
    .map((entry) => {
      switch (entry.kind) {
        case 'user':
          return entry.isTask
            ? `[user task]\n${entry.text}`
            : `[user steer]\n${entry.text}`;
        case 'agent':
          return `[${entry.label}]\n${entry.text}`;
        case 'final':
          return `[forum final by ${entry.label}]\n${entry.text}`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildDiscussionPrompt(
  nextPostNumber: number,
  minDiscussionRounds: number,
  entries: ForumTranscriptEntry[],
  memberId: string,
): string {
  return `Forum discussion update for your post ${nextPostNumber}

New public messages since your last forum post:
${formatTranscriptEntries(entries, memberId)}

Continue your investigation. When you are ready, call \`forum_post\` exactly once with your current public findings.
You are preparing forum post ${nextPostNumber}.
Set \`readyToConclude\` to true only if you believe the forum can move to final synthesis now.
Do not set \`readyToConclude\` before post ${minDiscussionRounds}.`;
}

function buildFinalPrompt(entries: ForumTranscriptEntry[]): string {
  return `Synthesize the final forum proposal.

Full public transcript:
${formatTranscriptEntries(entries)}

Produce the final answer by calling \`forum_post\` exactly once.`;
}

function createForumDefinition(
  presetName: string,
  member: ForumPresetMember,
  baseDefinition: LocalAgentDefinition,
): LocalAgentDefinition {
  const label = member.label ?? baseDefinition.displayName ?? member.memberId;
  const role = member.role ?? 'discussant';
  const baseSystemPrompt = baseDefinition.promptConfig.systemPrompt?.trim();
  const memberSystemPrompt = member.systemPrompt?.trim();
  const rolePrompt = buildRolePrompt(label, role);
  const systemPrompt = [baseSystemPrompt, memberSystemPrompt, rolePrompt]
    .filter(Boolean)
    .join('\n\n');

  return {
    ...baseDefinition,
    name: `forum-${presetName}-${member.memberId}`,
    displayName: label,
    description: baseDefinition.description,
    inputConfig: {
      inputSchema: FORUM_INPUT_SCHEMA,
    },
    outputConfig: undefined,
    processOutput: undefined,
    promptConfig: {
      systemPrompt,
      initialMessages: baseDefinition.promptConfig.initialMessages,
      query: '${query}',
    },
    modelConfig: mergeModelConfig(
      baseDefinition.modelConfig,
      member.modelConfig,
    ),
    toolConfig: member.toolConfig ?? baseDefinition.toolConfig,
    runConfig: {
      ...baseDefinition.runConfig,
      ...member.runConfig,
    },
    workspaceDirectories:
      member.workspaceDirectories ?? baseDefinition.workspaceDirectories,
  };
}

function registerForumModelConfig(
  config: Config,
  definition: LocalAgentDefinition,
): void {
  const model =
    definition.modelConfig.model === 'inherit'
      ? config.getModel()
      : definition.modelConfig.model;

  const resolvedModelConfig: ModelConfig = {
    ...definition.modelConfig,
    model,
  };

  config.modelConfigService.registerRuntimeModelConfig(
    getModelConfigAlias(definition),
    {
      modelConfig: resolvedModelConfig,
    },
  );

  if (resolvedModelConfig.model && isAutoModel(resolvedModelConfig.model)) {
    config.modelConfigService.registerRuntimeModelOverride({
      match: {
        overrideScope: definition.name,
      },
      modelConfig: {
        generateContentConfig: resolvedModelConfig.generateContentConfig,
      },
    });
  }
}

function formatMemberLabels(runtimes: ForumMemberRuntime[]): string {
  return runtimes.map((runtime) => runtime.state.label).join(', ');
}

function getMainConversationSeedHistory(config: Config): readonly Content[] {
  const geminiClient = config.getGeminiClient();
  if (!geminiClient.isInitialized()) {
    return [];
  }

  return geminiClient.getChat().getHistory(true);
}

function createForumAgentContext(
  config: Config,
  memberId: string,
): AgentLoopContext {
  const geminiClient = config.getGeminiClient();
  if (!geminiClient) {
    throw new Error('Gemini client is not initialized.');
  }

  return {
    config,
    promptId: `forum:${memberId}`,
    parentSessionId: config.getSessionId(),
    geminiClient,
    sandboxManager: config.sandboxManager,
    toolRegistry: config.getToolRegistry(),
    promptRegistry: config.getPromptRegistry(),
    resourceRegistry: config.getResourceRegistry(),
    messageBus: config.messageBus,
  };
}

export class ForumSessionController {
  private readonly config: Config;
  private readonly callbacks: ForumControllerCallbacks;
  private readonly preset: ForumPreset;
  private readonly options: Required<ForumSessionOptions>;
  private readonly runtimes = new Map<string, ForumMemberRuntime>();
  private readonly transcript: ForumTranscriptEntry[] = [];
  private readonly finalizerMemberId: string;
  private readonly maxRounds: number;
  private readonly minDiscussionRounds: number;

  private status: ForumSessionSnapshot['status'] = 'waiting_for_task';
  private task?: string;
  private stopRequested = false;
  private abortController?: AbortController;
  private disposed = false;
  private steerVersion = 0;
  private routerQueued = false;
  private synthesisStarted = false;
  private readonly inFlightTasks = new Set<Promise<void>>();

  private constructor(
    config: Config,
    preset: ForumPreset,
    runtimes: ForumMemberRuntime[],
    options?: ForumSessionOptions,
    callbacks?: ForumControllerCallbacks,
  ) {
    this.config = config;
    this.preset = preset;
    this.options = {
      includeMainConversationContext:
        options?.includeMainConversationContext !== false,
    };
    this.callbacks = callbacks ?? {};
    this.maxRounds = preset.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.minDiscussionRounds = Math.min(
      preset.minDiscussionRounds ?? DEFAULT_MIN_DISCUSSION_ROUNDS,
      this.maxRounds,
    );

    for (const runtime of runtimes) {
      this.runtimes.set(runtime.presetMember.memberId, runtime);
    }

    const synthesizer = preset.members.find(
      (member) => member.role === 'synthesizer',
    );
    this.finalizerMemberId =
      synthesizer?.memberId ??
      preset.members[preset.members.length - 1].memberId;
  }

  static async create(
    config: Config,
    preset: ForumPreset,
    callbacks?: ForumControllerCallbacks,
    options?: ForumSessionOptions,
  ): Promise<ForumSessionController> {
    const registry = config.getAgentRegistry();
    if (!registry) {
      throw new Error('Agent registry is not available.');
    }
    const controller = new ForumSessionController(
      config,
      preset,
      [],
      options,
      callbacks,
    );
    const runtimes: ForumMemberRuntime[] = [];

    for (const member of preset.members) {
      const definition = registry.getDefinitionForExplicitUse(member.agentName);
      if (!definition) {
        throw new Error(
          `Forum preset member "${member.memberId}" references unknown agent "${member.agentName}".`,
        );
      }
      if (definition.kind !== 'local') {
        throw new Error(
          `Forum preset member "${member.memberId}" must reference a local agent. Remote agents are not supported.`,
        );
      }

      const forumDefinition = createForumDefinition(
        preset.name,
        member,
        definition,
      );
      registerForumModelConfig(config, forumDefinition);
      const session = await PersistentForumMemberSession.create(
        member.memberId,
        forumDefinition,
        createForumAgentContext(config, member.memberId),
        (activity) => controller.handleMemberActivity(activity),
      );
      runtimes.push({
        presetMember: member,
        session,
        state: {
          memberId: member.memberId,
          label: forumDefinition.displayName ?? forumDefinition.name,
          role: member.role ?? 'discussant',
          status: 'idle',
        },
        deliveredCursor: 0,
        active: true,
        needsAttention: false,
        postCount: 0,
        readyToConclude: false,
        processedSteerVersion: 0,
        scheduledSteerVersion: 0,
        consecutiveErrors: 0,
      });
    }

    for (const runtime of runtimes) {
      controller.runtimes.set(runtime.presetMember.memberId, runtime);
    }
    controller.emitSnapshot();
    return controller;
  }

  getSnapshot(): ForumSessionSnapshot {
    return {
      presetName: this.preset.name,
      status: this.status,
      round: this.getDisplayRound(),
      task: this.task,
      pendingSteerCount: this.getPendingSteerCount(),
      members: [...this.runtimes.values()].map((runtime) => ({
        ...runtime.state,
      })),
    };
  }

  async startTask(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      throw new Error('Forum task cannot be empty.');
    }
    if (this.task) {
      throw new Error('Forum task has already started.');
    }

    this.task = trimmed;
    this.status = 'running';
    const seedHistory = this.options.includeMainConversationContext
      ? getMainConversationSeedHistory(this.config)
      : [];
    if (this.options.includeMainConversationContext && seedHistory.length > 0) {
      for (const runtime of this.runtimes.values()) {
        runtime.session.seedMainConversationHistory(seedHistory);
      }
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: `Seeded forum members with ${seedHistory.length} messages from the current main conversation.`,
      });
    } else if (!this.options.includeMainConversationContext) {
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: 'Forum started in incognito mode without main conversation context.',
      });
    }
    this.pushTranscript({
      kind: 'user',
      timestamp: Date.now(),
      text: trimmed,
      isTask: true,
    });
    this.markDiscussantsPending();
    this.pushTranscript({
      kind: 'system',
      timestamp: Date.now(),
      text: `Forum investigators started: ${formatMemberLabels(
        this.getDiscussionRuntimes(),
      )}.`,
    });
    this.emitSnapshot();
    this.requestProgress();
  }

  async addUserSteer(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (!this.task) {
      await this.startTask(trimmed);
      return;
    }

    this.steerVersion += 1;
    for (const runtime of this.getDiscussionRuntimes()) {
      runtime.readyToConclude = false;
    }
    this.pushTranscript({
      kind: 'user',
      timestamp: Date.now(),
      text: trimmed,
      isTask: false,
    });
    this.markDiscussantsPending();
    this.emitSnapshot();
    this.requestProgress();
  }

  async stop(reason = 'Forum stopped.'): Promise<void> {
    if (this.status === 'stopped' || this.status === 'completed') {
      return;
    }

    this.stopRequested = true;
    this.abortController?.abort();
    this.status = 'stopped';
    this.pushTranscript({
      kind: 'system',
      timestamp: Date.now(),
      text: reason,
    });
    this.emitSnapshot();

    await Promise.allSettled([...this.inFlightTasks]);
    await this.disposeAllSessions();
  }

  private getDiscussionRuntimes(): ForumMemberRuntime[] {
    return [...this.runtimes.values()].filter(
      (runtime) => runtime.presetMember.role !== 'synthesizer',
    );
  }

  private getActiveDiscussionRuntimes(): ForumMemberRuntime[] {
    return this.getDiscussionRuntimes().filter((runtime) => runtime.active);
  }

  private getDisplayRound(): number {
    if (!this.task) {
      return 0;
    }

    const runtimes = this.getActiveDiscussionRuntimes();
    if (runtimes.length === 0) {
      return 1;
    }

    return Math.max(
      1,
      Math.min(...runtimes.map((runtime) => runtime.postCount)) + 1,
    );
  }

  private getPendingSteerCount(): number {
    if (this.steerVersion === 0) {
      return 0;
    }

    const runtimes = this.getActiveDiscussionRuntimes();
    if (runtimes.length === 0) {
      return 0;
    }

    const minProcessedVersion = Math.min(
      ...runtimes.map((runtime) => runtime.processedSteerVersion),
    );
    return Math.max(0, this.steerVersion - minProcessedVersion);
  }

  private markDiscussantsPending(excludeMemberId?: string): void {
    for (const runtime of this.getActiveDiscussionRuntimes()) {
      if (runtime.state.memberId === excludeMemberId) {
        continue;
      }
      if (runtime.postCount >= this.maxRounds) {
        continue;
      }
      runtime.needsAttention = true;
    }
  }

  private hasRunningDiscussion(): boolean {
    return this.getActiveDiscussionRuntimes().some(
      (runtime) => runtime.state.status === 'running',
    );
  }

  private shouldRunSynthesis(): boolean {
    if (
      !this.task ||
      this.stopRequested ||
      this.synthesisStarted ||
      this.status === 'completed' ||
      this.status === 'error'
    ) {
      return false;
    }

    const discussants = this.getActiveDiscussionRuntimes();
    if (this.hasRunningDiscussion()) {
      return false;
    }

    if (discussants.length === 0) {
      return true;
    }

    if (discussants.every((runtime) => runtime.postCount >= this.maxRounds)) {
      return true;
    }

    const minPosts = Math.min(
      ...discussants.map((runtime) => runtime.postCount),
    );
    if (minPosts < this.minDiscussionRounds) {
      return false;
    }

    if (this.getPendingSteerCount() > 0) {
      return false;
    }

    return discussants.every((runtime) => runtime.readyToConclude);
  }

  private shouldStartRuntime(runtime: ForumMemberRuntime): boolean {
    if (!runtime.active || runtime.state.status === 'running') {
      return false;
    }
    if (!runtime.needsAttention) {
      return false;
    }
    if (runtime.postCount >= this.maxRounds) {
      return false;
    }
    return true;
  }

  private requestProgress(): void {
    if (
      this.routerQueued ||
      this.stopRequested ||
      this.status === 'synthesizing' ||
      this.status === 'completed' ||
      this.status === 'error'
    ) {
      return;
    }

    this.routerQueued = true;
    void this.trackTask(
      Promise.resolve()
        .then(() => this.routeWork())
        .catch((error) => this.handleFailure(error))
        .finally(() => {
          this.routerQueued = false;
          if (this.hasImmediateWork()) {
            this.requestProgress();
          }
        }),
    );
  }

  private hasImmediateWork(): boolean {
    return (
      this.shouldRunSynthesis() ||
      this.getActiveDiscussionRuntimes().some((runtime) =>
        this.shouldStartRuntime(runtime),
      )
    );
  }

  private async routeWork(): Promise<void> {
    if (
      this.stopRequested ||
      this.status === 'synthesizing' ||
      this.status === 'completed' ||
      this.status === 'error'
    ) {
      return;
    }

    if (this.shouldRunSynthesis()) {
      await this.runSynthesis();
      return;
    }

    const toStart = this.getActiveDiscussionRuntimes().filter((runtime) =>
      this.shouldStartRuntime(runtime),
    );

    if (toStart.length === 0) {
      this.emitSnapshot();
      return;
    }

    this.status = 'running';
    this.emitSnapshot();

    for (const runtime of toStart) {
      this.startDiscussionRun(runtime);
    }
  }

  private startDiscussionRun(runtime: ForumMemberRuntime): void {
    const entries = this.transcript.slice(runtime.deliveredCursor);
    runtime.deliveredCursor = this.transcript.length;
    runtime.needsAttention = false;
    runtime.state.status = 'running';
    runtime.state.lastError = undefined;
    runtime.scheduledSteerVersion = this.steerVersion;
    this.emitSnapshot();

    const prompt = buildDiscussionPrompt(
      runtime.postCount + 1,
      this.minDiscussionRounds,
      entries,
      runtime.state.memberId,
    );

    const task = this.trackTask(
      runtime.session
        .runRound(prompt, this.getAbortSignal())
        .then((result) => {
          this.handleDiscussionResult(runtime, result);
        })
        .catch((error) => {
          if (this.stopRequested) {
            return;
          }
          this.handleDiscussionResult(runtime, {
            memberId: runtime.state.memberId,
            label: runtime.state.label,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (!this.stopRequested) {
            this.requestProgress();
          }
        }),
    );

    void task;
  }

  private handleDiscussionResult(
    runtime: ForumMemberRuntime,
    result: ForumMemberRoundResult,
  ): void {
    if (result.post) {
      runtime.postCount += 1;
      runtime.readyToConclude =
        result.post.readyToConclude === true &&
        runtime.postCount >= this.minDiscussionRounds;
      runtime.processedSteerVersion = Math.max(
        runtime.processedSteerVersion,
        runtime.scheduledSteerVersion,
      );
      runtime.consecutiveErrors = 0;
      runtime.state.status = 'waiting';
      runtime.state.lastPost = result.post.message;
      runtime.state.lastError = undefined;
      this.pushTranscript({
        kind: 'agent',
        timestamp: Date.now(),
        memberId: runtime.state.memberId,
        label: runtime.state.label,
        text: result.post.message,
        round: runtime.postCount,
        readyToConclude: runtime.readyToConclude,
      });

      this.markDiscussantsPending(runtime.state.memberId);
      this.emitSnapshot();
      return;
    }

    runtime.state.lastError = result.error;

    if (result.aborted) {
      // Transient cancellation (deadline, forum-wide stop, etc.). Keep the
      // member active and wait for another member's post to trigger a retry,
      // rather than immediately re-running and likely hitting the same wall.
      runtime.needsAttention = false;
      runtime.state.status = this.stopRequested ? 'stopped' : 'waiting';
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: `${runtime.state.label} skipped this round: ${
          result.error ?? 'cancelled'
        }`,
      });
      this.emitSnapshot();
      return;
    }

    runtime.consecutiveErrors += 1;
    if (runtime.consecutiveErrors >= MAX_CONSECUTIVE_MEMBER_ERRORS) {
      runtime.active = false;
      runtime.needsAttention = false;
      runtime.state.status = 'error';
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: `${runtime.state.label} retired after ${runtime.consecutiveErrors} consecutive errors. Last error: ${
          result.error ?? 'Unknown error'
        }`,
      });
    } else {
      // Re-arm the member for an immediate retry. The retry budget bounds the
      // total cost: at most MAX_CONSECUTIVE_MEMBER_ERRORS attempts before the
      // member is retired.
      runtime.needsAttention = true;
      runtime.state.status = 'error';
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: `${runtime.state.label} failed (attempt ${runtime.consecutiveErrors}/${MAX_CONSECUTIVE_MEMBER_ERRORS}): ${
          result.error ?? 'Unknown error'
        }`,
      });
    }

    this.emitSnapshot();
  }

  private handleMemberActivity(activity: ForumMemberActivity): void {
    this.pushTranscript({
      kind: 'activity',
      timestamp: Date.now(),
      memberId: activity.memberId,
      label: activity.label,
      activityKind: activity.activityKind,
      text: activity.text,
    });
  }

  private async runSynthesis(): Promise<void> {
    const runtime = this.runtimes.get(this.finalizerMemberId);
    if (!runtime) {
      this.status = 'error';
      this.emitSnapshot();
      return;
    }

    this.synthesisStarted = true;
    this.status = 'synthesizing';
    runtime.state.status = 'running';
    this.pushTranscript({
      kind: 'system',
      timestamp: Date.now(),
      text: `Synthesizing final proposal with ${runtime.state.label}.`,
    });
    this.emitSnapshot();

    try {
      const prompt = buildFinalPrompt(this.transcript);
      const result = await runtime.session.runRound(
        prompt,
        this.getAbortSignal(),
      );

      if (result.post) {
        runtime.state.status = 'posted';
        runtime.state.lastPost = result.post.message;
        this.status = 'completed';
        this.pushTranscript({
          kind: 'final',
          timestamp: Date.now(),
          memberId: runtime.state.memberId,
          label: runtime.state.label,
          text: result.post.message,
        });
      } else {
        runtime.state.status = 'error';
        runtime.state.lastError = result.error;
        this.status = 'error';
        this.pushTranscript({
          kind: 'system',
          timestamp: Date.now(),
          text: `Final synthesis failed: ${result.error ?? 'Unknown error'}`,
        });
      }
    } catch (error) {
      this.status = 'error';
      runtime.state.status = 'error';
      runtime.state.lastError =
        error instanceof Error ? error.message : String(error);
      this.pushTranscript({
        kind: 'system',
        timestamp: Date.now(),
        text: `Final synthesis failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      this.emitSnapshot();
      if (this.status === 'completed' || this.status === 'error') {
        await this.disposeAllSessions();
      }
    }
  }

  private getAbortSignal(): AbortSignal {
    if (!this.abortController || this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    return this.abortController.signal;
  }

  private trackTask<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      this.inFlightTasks.delete(trackedVoid);
    });
    const trackedVoid = tracked.then(
      () => undefined,
      () => undefined,
    );
    this.inFlightTasks.add(trackedVoid);
    return tracked;
  }

  private async disposeAllSessions(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await Promise.all(
      [...this.runtimes.values()].map((runtime) => runtime.session.dispose()),
    );
  }

  private handleFailure(error: unknown): void {
    this.status = 'error';
    this.pushTranscript({
      kind: 'system',
      timestamp: Date.now(),
      text: `Forum failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    this.emitSnapshot();
    void this.disposeAllSessions();
  }

  private emitSnapshot(): void {
    this.callbacks.onSnapshot?.(this.getSnapshot());
  }

  private pushTranscript(entry: ForumTranscriptEntry): void {
    this.transcript.push(entry);
    this.callbacks.onTranscriptEntry?.(entry);
  }
}
