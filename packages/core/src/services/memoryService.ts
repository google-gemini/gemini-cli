/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/config.js';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
} from './chatRecordingService.js';
import { debugLogger } from '../utils/debugLogger.js';
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

const LOCK_FILENAME = '.extraction.lock';
const STATE_FILENAME = '.extraction-state.json';
const LOCK_STALE_MS = 35 * 60 * 1000; // 35 minutes (exceeds agent's 30-min time limit)
const MIN_USER_MESSAGES = 10;
const MIN_IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SESSION_INDEX_SIZE = 50;

/**
 * Lock file content for coordinating across CLI instances.
 */
interface LockInfo {
  pid: number;
  startedAt: string;
}

/**
 * Metadata for a single extraction run.
 */
export interface ExtractionRun {
  runAt: string;
  sessionIds: string[];
  skillsCreated: string[];
}

/**
 * Tracks extraction history with per-run metadata.
 */
export interface ExtractionState {
  runs: ExtractionRun[];
}

/**
 * Returns all session IDs that have been processed across all runs.
 */
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

/**
 * Attempts to acquire an exclusive lock file using O_CREAT | O_EXCL.
 * Returns true if the lock was acquired, false if another instance owns it.
 */
export async function tryAcquireLock(
  lockPath: string,
  retries = 1,
): Promise<boolean> {
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  try {
    // Atomic create-if-not-exists
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
      // Lock exists — check if it's stale
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

/**
 * Checks if a lock file is stale (owner PID is dead or lock is too old).
 */
export async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isLockInfo(parsed)) {
      return true; // Invalid lock data — treat as stale
    }
    const lockInfo = parsed;

    // Check if PID is still alive
    try {
      process.kill(lockInfo.pid, 0);
    } catch {
      // PID is dead — lock is stale
      return true;
    }

    // Check if lock is too old
    const lockAge = Date.now() - new Date(lockInfo.startedAt).getTime();
    if (lockAge > LOCK_STALE_MS) {
      return true;
    }

    return false;
  } catch {
    // Can't read lock — treat as stale
    return true;
  }
}

/**
 * Releases the lock file.
 */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return; // Already removed
    }
    debugLogger.warn(
      `[MemoryService] Failed to release lock: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Reads the extraction state file, or returns a default state.
 */
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

/**
 * Writes the extraction state atomically (temp file + rename).
 */
export async function writeExtractionState(
  statePath: string,
  state: ExtractionState,
): Promise<void> {
  const tmpPath = `${statePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2));
  await fs.rename(tmpPath, statePath);
}

/**
 * Determines if a conversation record should be considered for processing.
 * Filters out subagent sessions, sessions that haven't been idle long enough,
 * and sessions with too few user messages.
 */
function shouldProcessConversation(parsed: ConversationRecord): boolean {
  // Skip subagent sessions
  if (parsed.kind === 'subagent') return false;

  // Skip sessions that are still active (not idle for 3+ hours)
  const lastUpdated = new Date(parsed.lastUpdated).getTime();
  if (Date.now() - lastUpdated < MIN_IDLE_MS) return false;

  // Skip sessions with too few user messages
  const userMessageCount = parsed.messages.filter(
    (m) => m.type === 'user',
  ).length;
  if (userMessageCount < MIN_USER_MESSAGES) return false;

  return true;
}

/**
 * Scans the chats directory for eligible session files (sorted most-recent-first,
 * capped at MAX_SESSION_INDEX_SIZE). Shared by buildSessionIndex.
 */
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

  // Sort by filename descending (most recent first)
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

/**
 * Builds a session index for the extraction agent: a compact listing of all
 * eligible sessions with their summary, file path, and new/previously-processed status.
 * The agent can use read_file on paths to inspect sessions that look promising.
 *
 * Returns the index text and the list of new (unprocessed) session IDs.
 */
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

/**
 * Builds a summary of all existing skills — both memory-extracted skills
 * in the skillsDir and globally/workspace-discovered skills from the SkillManager.
 * This prevents the extraction agent from duplicating already-available skills.
 */
async function buildExistingSkillsSummary(
  skillsDir: string,
  config: Config,
): Promise<string> {
  const sections: string[] = [];

  // 1. Memory-extracted skills (from previous runs)
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
        // Skill directory without SKILL.md, skip
      }
    }
  } catch {
    // Skills directory doesn't exist yet
  }

  if (memorySkills.length > 0) {
    sections.push(
      `## Previously Extracted Skills (in ${skillsDir})\n${memorySkills.join('\n')}`,
    );
  }

  // 2. Discovered skills — categorize by source location
  try {
    const discoveredSkills = config.getSkillManager().getSkills();
    if (discoveredSkills.length > 0) {
      const userSkillsDir = Storage.getUserSkillsDir();
      const globalSkills: string[] = [];
      const workspaceSkills: string[] = [];
      const extensionSkills: string[] = [];
      const builtinSkills: string[] = [];

      for (const s of discoveredSkills) {
        const entry = `- **${s.name}**: ${s.description}`;
        const loc = s.location;
        if (loc.includes('/bundle/') || loc.includes('\\bundle\\')) {
          builtinSkills.push(entry);
        } else if (loc.startsWith(userSkillsDir)) {
          globalSkills.push(entry);
        } else if (
          loc.includes('/extensions/') ||
          loc.includes('\\extensions\\')
        ) {
          extensionSkills.push(entry);
        } else {
          workspaceSkills.push(entry);
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
    // SkillManager not available
  }

  return sections.join('\n\n');
}

/**
 * Builds an AgentLoopContext from a Config for background agent execution.
 */
function buildAgentLoopContext(config: Config): AgentLoopContext {
  // Create a PolicyEngine that auto-approves all tool calls so the
  // background sub-agent never prompts the user for confirmation.
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

/**
 * Main entry point for the skill extraction background task.
 * Designed to be called fire-and-forget on session startup.
 *
 * Coordinates across multiple CLI instances via a lock file,
 * scans past sessions for reusable patterns, and runs a sub-agent
 * to extract and write SKILL.md files.
 */
export async function startMemoryService(config: Config): Promise<void> {
  const memoryDir = config.storage.getProjectMemoryTempDir();
  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const lockPath = path.join(memoryDir, LOCK_FILENAME);
  const statePath = path.join(memoryDir, STATE_FILENAME);
  const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

  // Ensure directories exist
  await fs.mkdir(skillsDir, { recursive: true });

  debugLogger.log(`[MemoryService] Starting. Skills dir: ${skillsDir}`);

  // Try to acquire exclusive lock
  if (!(await tryAcquireLock(lockPath))) {
    debugLogger.log('[MemoryService] Skipped: lock held by another instance');
    return;
  }
  debugLogger.log('[MemoryService] Lock acquired');

  // Register with ExecutionLifecycleService for background tracking
  const abortController = new AbortController();
  const handle = ExecutionLifecycleService.createExecution(
    '', // no initial output
    () => abortController.abort(), // onKill
    'none',
    undefined, // no format injection
    'Skill extraction',
    'silent',
  );
  const executionId = handle.pid;

  const startTime = Date.now();
  let completionResult: { error: Error } | undefined;
  try {
    // Read extraction state
    const state = await readExtractionState(statePath);
    const previousRuns = state.runs.length;
    const previouslyProcessed = getProcessedSessionIds(state).size;
    debugLogger.log(
      `[MemoryService] State loaded: ${previousRuns} previous run(s), ${previouslyProcessed} session(s) already processed`,
    );

    // Build session index: all eligible sessions with summaries + file paths.
    // The agent decides which to read in full via read_file.
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

    // Snapshot existing skill directories before extraction
    const skillsBefore = new Set<string>();
    try {
      const entries = await fs.readdir(skillsDir);
      for (const e of entries) {
        skillsBefore.add(e);
      }
    } catch {
      // Empty skills dir
    }
    debugLogger.log(
      `[MemoryService] ${skillsBefore.size} existing skill(s) in memory`,
    );

    // Read existing skills for context (memory-extracted + global/workspace)
    const existingSkillsSummary = await buildExistingSkillsSummary(
      skillsDir,
      config,
    );
    if (existingSkillsSummary) {
      debugLogger.log(
        `[MemoryService] Existing skills context:\n${existingSkillsSummary}`,
      );
    }

    // Build agent definition and context
    const agentDefinition = SkillExtractionAgent(
      skillsDir,
      sessionIndex,
      existingSkillsSummary,
    );

    const context = buildAgentLoopContext(config);

    // Register the agent's model config since it's not going through AgentRegistry.
    const modelAlias = getModelConfigAlias(agentDefinition);
    config.modelConfigService.registerRuntimeModelConfig(modelAlias, {
      modelConfig: agentDefinition.modelConfig,
    });
    debugLogger.log(
      `[MemoryService] Starting extraction agent (model: ${agentDefinition.modelConfig.model}, maxTurns: 30, maxTime: 30min)`,
    );

    // Create and run the extraction agent
    const executor = await LocalAgentExecutor.create(agentDefinition, context);

    await executor.run(
      { request: 'Extract skills from the provided sessions.' },
      abortController.signal,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Diff skills directory to find newly created skills
    const skillsCreated: string[] = [];
    try {
      const entriesAfter = await fs.readdir(skillsDir);
      for (const e of entriesAfter) {
        if (!skillsBefore.has(e)) {
          skillsCreated.push(e);
        }
      }
    } catch {
      // Skills dir read failed
    }

    // Record the run with full metadata
    const run: ExtractionRun = {
      runAt: new Date().toISOString(),
      sessionIds: newSessionIds,
      skillsCreated,
    };
    const updatedState: ExtractionState = {
      runs: [...state.runs, run],
    };
    await writeExtractionState(statePath, updatedState);

    if (skillsCreated.length > 0) {
      debugLogger.log(
        `[MemoryService] Completed in ${elapsed}s. Created ${skillsCreated.length} skill(s): ${skillsCreated.join(', ')}`,
      );
    } else {
      debugLogger.log(
        `[MemoryService] Completed in ${elapsed}s. No new skills created (processed ${newSessionIds.length} session(s))`,
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
