/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { MemoryProvider } from './memoryProvider.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as Diff from 'diff';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
} from './chatRecordingService.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';
import { isNodeError } from '../utils/errors.js';
import { FRONTMATTER_REGEX, parseFrontmatter } from '../skills/skillLoader.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import { SkillExtractionAgent } from '../agents/skill-extraction-agent.js';
import { getModelConfigAlias } from '../agents/registry.js';
import { ExecutionLifecycleService } from './executionLifecycleService.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { Storage } from '../config/storage.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import {
  applyParsedSkillPatches,
  hasParsedPatchHunks,
} from './memoryPatchUtils.js';

const LOCK_FILENAME = '.extraction.lock';
const STATE_FILENAME = '.extraction-state.json';
const LOCK_STALE_MS = 35 * 60 * 1000; // 35 minutes (exceeds agent's 30-min time limit)
const MIN_USER_MESSAGES = 10;
const MIN_IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SESSION_INDEX_SIZE = 50;

// ... keeping all existing helper types and functions above startMemoryService

interface LockInfo {
  pid: number;
  startedAt: string;
}

export interface ExtractionRun {
  runAt: string;
  sessionIds: string[];
  skillsCreated: string[];
}

export interface ExtractionState {
  runs: ExtractionRun[];
}

export function getProcessedSessionIds(state: ExtractionState): Set<string> {
  const ids = new Set<string>();
  for (const run of state.runs) {
    for (const id of run.sessionIds) {
      ids.add(id);
    }
  }
  return ids;
}

function isLockInfo(value: unknown): value is LockInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  );
}

function isConversationRecord(value: unknown): value is ConversationRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    'messages' in value &&
    Array.isArray(value.messages) &&
    'projectHash' in value &&
    'startTime' in value &&
    'lastUpdated' in value
  );
}

function isExtractionRun(value: unknown): value is ExtractionRun {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runAt' in value &&
    typeof value.runAt === 'string' &&
    'sessionIds' in value &&
    Array.isArray(value.sessionIds) &&
    'skillsCreated' in value &&
    Array.isArray(value.skillsCreated)
  );
}

function isExtractionState(value: unknown): value is { runs: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runs' in value &&
    Array.isArray(value.runs)
  );
}

export async function tryAcquireLock(
  lockPath: string,
  retries = 1,
): Promise<boolean> {
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  try {
    const fd = await fs.open(
      lockPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    );
    try {
      await fd.writeFile(JSON.stringify(lockInfo));
    } finally {
      await fd.close();
    }
    return true;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      if (retries > 0 && (await isLockStale(lockPath))) {
        debugLogger.debug('[MemoryService] Cleaning up stale lock file');
        await releaseLock(lockPath);
        return tryAcquireLock(lockPath, retries - 1);
      }
      debugLogger.debug(
        '[MemoryService] Lock held by another instance, skipping',
      );
      return false;
    }
    throw error;
  }
}

export async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isLockInfo(parsed)) {
      return true;
    }
    const lockInfo = parsed;

    try {
      process.kill(lockInfo.pid, 0);
    } catch {
      return true;
    }

    const lockAge = Date.now() - new Date(lockInfo.startedAt).getTime();
    if (lockAge > LOCK_STALE_MS) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return;
    }
    debugLogger.warn(
      `[MemoryService] Failed to release lock: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function readExtractionState(
  statePath: string,
): Promise<ExtractionState> {
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isExtractionState(parsed)) {
      return { runs: [] };
    }

    const runs: ExtractionRun[] = [];
    for (const run of parsed.runs) {
      if (!isExtractionRun(run)) continue;
      runs.push({
        runAt: run.runAt,
        sessionIds: run.sessionIds.filter(
          (sid): sid is string => typeof sid === 'string',
        ),
        skillsCreated: run.skillsCreated.filter(
          (sk): sk is string => typeof sk === 'string',
        ),
      });
    }

    return { runs };
  } catch (error) {
    debugLogger.debug(
      '[MemoryService] Failed to read extraction state:',
      error,
    );
    return { runs: [] };
  }
}

export async function writeExtractionState(
  statePath: string,
  state: ExtractionState,
): Promise<void> {
  const tmpPath = `${statePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2));
  await fs.rename(tmpPath, statePath);
}

function shouldProcessConversation(parsed: ConversationRecord): boolean {
  if (parsed.kind === 'subagent') return false;

  const lastUpdated = new Date(parsed.lastUpdated).getTime();
  if (Date.now() - lastUpdated < MIN_IDLE_MS) return false;

  const userMessageCount = parsed.messages.filter(
    (m) => m.type === 'user',
  ).length;
  if (userMessageCount < MIN_USER_MESSAGES) return false;

  return true;
}

async function scanEligibleSessions(
  chatsDir: string,
): Promise<Array<{ conversation: ConversationRecord; filePath: string }>> {
  let allFiles: string[];
  try {
    allFiles = await fs.readdir(chatsDir);
  } catch {
    return [];
  }

  const sessionFiles = allFiles.filter(
    (f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'),
  );

  sessionFiles.sort((a, b) => b.localeCompare(a));

  const results: Array<{ conversation: ConversationRecord; filePath: string }> =
    [];

  for (const file of sessionFiles) {
    if (results.length >= MAX_SESSION_INDEX_SIZE) break;

    const filePath = path.join(chatsDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isConversationRecord(parsed)) continue;
      if (!shouldProcessConversation(parsed)) continue;

      results.push({ conversation: parsed, filePath });
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

export async function buildSessionIndex(
  chatsDir: string,
  state: ExtractionState,
): Promise<{ sessionIndex: string; newSessionIds: string[] }> {
  const processedSet = getProcessedSessionIds(state);
  const eligible = await scanEligibleSessions(chatsDir);

  if (eligible.length === 0) {
    return { sessionIndex: '', newSessionIds: [] };
  }

  const lines: string[] = [];
  const newSessionIds: string[] = [];

  for (const { conversation, filePath } of eligible) {
    const userMessageCount = conversation.messages.filter(
      (m) => m.type === 'user',
    ).length;
    const isNew = !processedSet.has(conversation.sessionId);
    if (isNew) {
      newSessionIds.push(conversation.sessionId);
    }

    const status = isNew ? '[NEW]' : '[old]';
    const summary = conversation.summary ?? '(no summary)';
    lines.push(
      `${status} ${summary} (${userMessageCount} user msgs) — ${filePath}`,
    );
  }

  return { sessionIndex: lines.join('\n'), newSessionIds };
}

async function buildExistingSkillsSummary(
  skillsDir: string,
  config: Config,
): Promise<string> {
  const sections: string[] = [];

  const memorySkills: string[] = [];
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const match = content.match(FRONTMATTER_REGEX);
        if (match) {
          const parsed = parseFrontmatter(match[1]);
          const name = parsed?.name ?? entry.name;
          const desc = parsed?.description ?? '';
          memorySkills.push(`- **${name}**: ${desc}`);
        } else {
          memorySkills.push(`- **${entry.name}**`);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip unreadable files
  }

  if (memorySkills.length > 0) {
    sections.push(
      `## Previously Extracted Skills (in ${skillsDir})\n${memorySkills.join('\n')}`,
    );
  }

  try {
    const discoveredSkills = config.getSkillManager().getSkills();
    if (discoveredSkills.length > 0) {
      const userSkillsDir = Storage.getUserSkillsDir();
      const globalSkills: string[] = [];
      const workspaceSkills: string[] = [];
      const extensionSkills: string[] = [];
      const builtinSkills: string[] = [];

      for (const s of discoveredSkills) {
        const loc = s.location;
        if (loc.includes('/bundle/') || loc.includes('\\bundle\\')) {
          builtinSkills.push(`- **${s.name}**: ${s.description}`);
        } else if (loc.startsWith(userSkillsDir)) {
          globalSkills.push(`- **${s.name}**: ${s.description} (${loc})`);
        } else if (
          loc.includes('/extensions/') ||
          loc.includes('\\extensions\\')
        ) {
          extensionSkills.push(`- **${s.name}**: ${s.description}`);
        } else {
          workspaceSkills.push(`- **${s.name}**: ${s.description} (${loc})`);
        }
      }

      if (globalSkills.length > 0) {
        sections.push(
          `## Global Skills (~/.gemini/skills — do NOT duplicate)\n${globalSkills.join('\n')}`,
        );
      }
      if (workspaceSkills.length > 0) {
        sections.push(
          `## Workspace Skills (.gemini/skills — do NOT duplicate)\n${workspaceSkills.join('\n')}`,
        );
      }
      if (extensionSkills.length > 0) {
        sections.push(
          `## Extension Skills (from installed extensions — do NOT duplicate)\n${extensionSkills.join('\n')}`,
        );
      }
      if (builtinSkills.length > 0) {
        sections.push(
          `## Builtin Skills (bundled with CLI — do NOT duplicate)\n${builtinSkills.join('\n')}`,
        );
      }
    }
  } catch {
    // Skip unreadable files
  }

  return sections.join('\n\n');
}

function buildAgentLoopContext(config: Config): AgentLoopContext {
  const autoApprovePolicy = new PolicyEngine({
    rules: [
      {
        toolName: '*',
        decision: PolicyDecision.ALLOW,
        priority: 100,
      },
    ],
  });
  const autoApproveBus = new MessageBus(autoApprovePolicy);

  return {
    config,
    promptId: `skill-extraction-${randomUUID().slice(0, 8)}`,
    toolRegistry: config.getToolRegistry(),
    promptRegistry: new PromptRegistry(),
    resourceRegistry: new ResourceRegistry(),
    messageBus: autoApproveBus,
    geminiClient: config.getGeminiClient(),
    sandboxManager: config.sandboxManager,
  };
}

export async function validatePatches(
  skillsDir: string,
  config: Config,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const patchFiles = entries.filter((e) => e.endsWith('.patch'));
  const validPatches: string[] = [];

  for (const patchFile of patchFiles) {
    const patchPath = path.join(skillsDir, patchFile);
    let valid = true;
    let reason = '';

    try {
      const patchContent = await fs.readFile(patchPath, 'utf-8');
      const parsedPatches = Diff.parsePatch(patchContent);

      if (!hasParsedPatchHunks(parsedPatches)) {
        valid = false;
        reason = 'no hunks found in patch';
      } else {
        const applied = await applyParsedSkillPatches(parsedPatches, config);
        if (!applied.success) {
          valid = false;
          switch (applied.reason) {
            case 'missingTargetPath':
              reason = 'missing target file path in patch header';
              break;
            case 'invalidPatchHeaders':
              reason = 'invalid diff headers';
              break;
            case 'outsideAllowedRoots':
              reason = `target file is outside skill roots: ${applied.targetPath}`;
              break;
            case 'newFileAlreadyExists':
              reason = `new file target already exists: ${applied.targetPath}`;
              break;
            case 'targetNotFound':
              reason = `target file not found: ${applied.targetPath}`;
              break;
            case 'doesNotApply':
              reason = `patch does not apply cleanly to ${applied.targetPath}`;
              break;
            default:
              reason = 'unknown patch validation failure';
              break;
          }
        }
      }
    } catch (err) {
      valid = false;
      reason = `failed to read or parse patch: ${err}`;
    }

    if (valid) {
      validPatches.push(patchFile);
      debugLogger.log(`[MemoryService] Patch validated: ${patchFile}`);
    } else {
      debugLogger.warn(
        `[MemoryService] Removing invalid patch ${patchFile}: ${reason}`,
      );
      try {
        await fs.unlink(patchPath);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  return validPatches;
}

export class DefaultMemoryProvider implements MemoryProvider {
  readonly id = 'gemini-cli-builtin-memory';

  onSessionStart(config: Config, _sessionId: string): void {
    void this.startSkillExtractionTask(config).catch((error) => {
      debugLogger.warn(
        '[MemoryService] Failed to start background skill extraction:',
        error,
      );
    });
  }

  getSystemInstructions(): string {
    return '';
  }

  getTurnContext(_query: string): string {
    return '';
  }

  onTurnComplete(_userMessage: string, _assistantMessage: string): void {}

  onSessionEnd(): void {}

  private async startSkillExtractionTask(config: Config): Promise<void> {
    const memoryDir = config.storage.getProjectMemoryTempDir();
    const skillsDir = config.storage.getProjectSkillsMemoryDir();
    const lockPath = path.join(memoryDir, LOCK_FILENAME);
    const statePath = path.join(memoryDir, STATE_FILENAME);
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

    await fs.mkdir(skillsDir, { recursive: true });

    debugLogger.log(`[MemoryService] Starting. Skills dir: ${skillsDir}`);

    if (!(await tryAcquireLock(lockPath))) {
      debugLogger.log('[MemoryService] Skipped: lock held by another instance');
      return;
    }
    debugLogger.log('[MemoryService] Lock acquired');

    const abortController = new AbortController();
    const handle = ExecutionLifecycleService.createExecution(
      '',
      () => abortController.abort(),
      'none',
      undefined,
      'Skill extraction',
      'silent',
    );
    const executionId = handle.pid;

    const startTime = Date.now();
    let completionResult: { error: Error } | undefined;
    try {
      const state = await readExtractionState(statePath);
      const previousRuns = state.runs.length;
      const previouslyProcessed = getProcessedSessionIds(state).size;
      debugLogger.log(
        `[MemoryService] State loaded: ${previousRuns} previous run(s), ${previouslyProcessed} session(s) already processed`,
      );

      const { sessionIndex, newSessionIds } = await buildSessionIndex(
        chatsDir,
        state,
      );

      const totalInIndex = sessionIndex ? sessionIndex.split('\n').length : 0;
      debugLogger.log(
        `[MemoryService] Session scan: ${totalInIndex} eligible session(s) found, ${newSessionIds.length} new`,
      );

      if (newSessionIds.length === 0) {
        debugLogger.log('[MemoryService] Skipped: no new sessions to process');
        return;
      }

      const skillsBefore = new Set<string>();
      const patchContentsBefore = new Map<string, string>();
      try {
        const entries = await fs.readdir(skillsDir);
        for (const e of entries) {
          if (e.endsWith('.patch')) {
            try {
              patchContentsBefore.set(
                e,
                await fs.readFile(path.join(skillsDir, e), 'utf-8'),
              );
            } catch {
              // Skip unreadable files
            }
            continue;
          }
          skillsBefore.add(e);
        }
      } catch {
        // Skip unreadable files
      }
      debugLogger.log(
        `[MemoryService] ${skillsBefore.size} existing skill(s) in memory`,
      );

      const existingSkillsSummary = await buildExistingSkillsSummary(
        skillsDir,
        config,
      );
      if (existingSkillsSummary) {
        debugLogger.log(
          `[MemoryService] Existing skills context:\n${existingSkillsSummary}`,
        );
      }

      const agentDefinition = SkillExtractionAgent(
        skillsDir,
        sessionIndex,
        existingSkillsSummary,
      );

      const context = buildAgentLoopContext(config);

      const modelAlias = getModelConfigAlias(agentDefinition);
      config.modelConfigService.registerRuntimeModelConfig(modelAlias, {
        modelConfig: agentDefinition.modelConfig,
      });
      debugLogger.log(
        `[MemoryService] Starting extraction agent (model: ${agentDefinition.modelConfig.model}, maxTurns: 30, maxTime: 30min)`,
      );

      const executor = await LocalAgentExecutor.create(
        agentDefinition,
        context,
      );

      await executor.run(
        { request: 'Extract skills from the provided sessions.' },
        abortController.signal,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const skillsCreated: string[] = [];
      try {
        const entriesAfter = await fs.readdir(skillsDir);
        for (const e of entriesAfter) {
          if (!skillsBefore.has(e) && !e.endsWith('.patch')) {
            skillsCreated.push(e);
          }
        }
      } catch {
        // Skip unreadable files
      }

      const validPatches = await validatePatches(skillsDir, config);
      const patchesCreatedThisRun: string[] = [];
      for (const patchFile of validPatches) {
        const patchPath = path.join(skillsDir, patchFile);
        let currentContent: string;
        try {
          currentContent = await fs.readFile(patchPath, 'utf-8');
        } catch {
          continue;
        }
        if (patchContentsBefore.get(patchFile) !== currentContent) {
          patchesCreatedThisRun.push(patchFile);
        }
      }
      if (validPatches.length > 0) {
        debugLogger.log(
          `[MemoryService] ${validPatches.length} valid patch(es) currently in inbox; ${patchesCreatedThisRun.length} created or updated this run`,
        );
      }

      const run: ExtractionRun = {
        runAt: new Date().toISOString(),
        sessionIds: newSessionIds,
        skillsCreated,
      };
      const updatedState: ExtractionState = {
        runs: [...state.runs, run],
      };
      await writeExtractionState(statePath, updatedState);

      if (skillsCreated.length > 0 || patchesCreatedThisRun.length > 0) {
        const completionParts: string[] = [];
        if (skillsCreated.length > 0) {
          completionParts.push(
            `created ${skillsCreated.length} skill(s): ${skillsCreated.join(', ')}`,
          );
        }
        if (patchesCreatedThisRun.length > 0) {
          completionParts.push(
            `prepared ${patchesCreatedThisRun.length} patch(es): ${patchesCreatedThisRun.join(', ')}`,
          );
        }
        debugLogger.log(
          `[MemoryService] Completed in ${elapsed}s. ${completionParts.join('; ')} (processed ${newSessionIds.length} session(s))`,
        );
        const feedbackParts: string[] = [];
        if (skillsCreated.length > 0) {
          feedbackParts.push(
            `${skillsCreated.length} new skill${skillsCreated.length > 1 ? 's' : ''} extracted from past sessions: ${skillsCreated.join(', ')}`,
          );
        }
        if (patchesCreatedThisRun.length > 0) {
          feedbackParts.push(
            `${patchesCreatedThisRun.length} skill update${patchesCreatedThisRun.length > 1 ? 's' : ''} extracted from past sessions`,
          );
        }
        coreEvents.emitFeedback(
          'info',
          `${feedbackParts.join('. ')}. Use /memory inbox to review.`,
        );
      } else {
        debugLogger.log(
          `[MemoryService] Completed in ${elapsed}s. No new skills or patches created (processed ${newSessionIds.length} session(s))`,
        );
      }
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (abortController.signal.aborted) {
        debugLogger.log(`[MemoryService] Cancelled after ${elapsed}s`);
      } else {
        debugLogger.log(
          `[MemoryService] Failed after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      completionResult = {
        error: error instanceof Error ? error : new Error(String(error)),
      };
      return;
    } finally {
      await releaseLock(lockPath);
      debugLogger.log('[MemoryService] Lock released');
      if (executionId !== undefined) {
        ExecutionLifecycleService.completeExecution(
          executionId,
          completionResult,
        );
      }
    }
  }
}
