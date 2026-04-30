/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Config,
  ApprovalMode,
  type MemoryScratchpad,
  SESSION_FILE_PREFIX,
  getProjectHash,
  startMemoryService,
} from '@google/gemini-cli-core';
import { ComponentRig, componentEvalTest } from './component-test-helper.js';
import {
  average,
  averageNullable,
  countMatchingIds,
  roundStat,
} from './statistics-helper.js';
import { prepareWorkspace } from './test-helper.js';

interface SeedSession {
  sessionId: string;
  summary: string;
  userTurns: string[];
  timestampOffsetMinutes: number;
  memoryScratchpad?: MemoryScratchpad;
}

interface MessageRecord {
  id: string;
  timestamp: string;
  type: string;
  content: Array<{ text: string }>;
}

interface SessionVersion {
  sessionId: string;
  lastUpdated: string;
}

interface ExtractionRunSnapshot {
  sessionIds: string[];
  skillsCreated: string[];
  candidateSessions: SessionVersion[];
  processedSessions: SessionVersion[];
  turnCount?: number;
  durationMs?: number;
  terminateReason?: string;
}

interface ExtractionOutcome {
  state: { runs: ExtractionRunSnapshot[] };
  skillsDir: string;
  skillBodies: string[];
}

interface SkillQualitySignal {
  label: string;
  pattern: RegExp;
}

interface ScratchpadRunMetrics {
  turnCount: number | null;
  durationMs: number | null;
  terminateReason: string | null;
  skillsCreated: number;
  candidateSessions: number;
  processedSessions: number;
  relevantReads: number;
  distractorReads: number;
  totalReads: number;
  recall: number;
  precision: number;
  signalScore: number;
  skillQualityScore: number;
  skillQualityMax: number;
  skillQualityRatio: number;
  missingQualitySignals: string[];
}

interface ScratchpadStatsTrial {
  trial: number;
  baseline: ScratchpadRunMetrics;
  enhanced: ScratchpadRunMetrics;
}

interface ScratchpadStatsAggregate {
  turnCountAvg: number | null;
  durationMsAvg: number | null;
  recallAvg: number;
  precisionAvg: number;
  signalScoreAvg: number;
  relevantReadsAvg: number;
  distractorReadsAvg: number;
  skillsCreatedAvg: number;
  skillQualityScoreAvg: number;
  skillQualityRatioAvg: number;
}

interface ScratchpadStatsReport {
  generatedAt: string;
  trials: number;
  aggregate: {
    baseline: ScratchpadStatsAggregate;
    enhanced: ScratchpadStatsAggregate;
  };
  deltas: ScratchpadStatsAggregate;
  results: ScratchpadStatsTrial[];
}

const WORKSPACE_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'skill-extraction-eval',
      private: true,
      scripts: {
        build: 'echo build',
        lint: 'echo lint',
        test: 'echo test',
      },
    },
    null,
    2,
  ),
  'README.md': `# Skill Extraction Eval

This workspace exists to exercise background skill extraction from prior chats.
`,
};

function buildMessages(userTurns: string[]): MessageRecord[] {
  const baseTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  return userTurns.flatMap((text, index) => [
    {
      id: `u${index + 1}`,
      timestamp: baseTime,
      type: 'user',
      content: [{ text }],
    },
    {
      id: `a${index + 1}`,
      timestamp: baseTime,
      type: 'gemini',
      content: [{ text: `Acknowledged: ${index + 1}` }],
    },
  ]);
}

function padTurns(turns: string[]): string[] {
  if (turns.length >= 10) {
    return turns;
  }

  const padded = [...turns];
  for (let i = turns.length; i < 10; i++) {
    padded.push(`${turns[i % turns.length]} (repeat ${i + 1})`);
  }
  return padded;
}

function createScratchpad(
  workflowSummary: string,
  touchedPaths: string[],
  validationStatus: MemoryScratchpad['validationStatus'] = 'passed',
): MemoryScratchpad {
  return {
    version: 1,
    workflowSummary,
    toolSequence: ['run_shell_command'],
    touchedPaths,
    validationStatus,
  };
}

function createWorkflowComparisonSessions(withScratchpad: boolean): {
  sessions: SeedSession[];
  relevantSessionIds: string[];
  distractorSessionIds: string[];
} {
  const relevantWorkflowSummary =
    'run_shell_command -> run_shell_command | paths packages/cli/src/config/settings.ts, docs/settings.md | validated';

  const relevantScratchpad = withScratchpad
    ? createScratchpad(relevantWorkflowSummary, [
        'packages/cli/src/config/settings.ts',
        'docs/settings.md',
      ])
    : undefined;

  const sessions: SeedSession[] = [
    {
      sessionId: 'hidden-settings-workflow-a',
      summary: 'Prepare release notes for settings launch',
      timestampOffsetMinutes: 420,
      memoryScratchpad: relevantScratchpad,
      userTurns: padTurns([
        'When we add a new setting, the durable workflow is to regenerate the settings docs instead of editing them by hand.',
        'The sequence that worked was npm run predocs:settings, npm run schema:settings, then npm run docs:settings.',
        'Skipping predocs leaves stale defaults in the generated docs.',
        'We verify the workflow by checking that both the schema output and docs update together.',
        'This exact command order is the recurring workflow we use for settings changes.',
      ]),
    },
    {
      sessionId: 'hidden-settings-workflow-b',
      summary: 'Investigate CI drift in generated config reference',
      timestampOffsetMinutes: 390,
      memoryScratchpad: relevantScratchpad,
      userTurns: padTurns([
        'The config reference drift was fixed by rerunning the standard settings regeneration workflow.',
        'We again used npm run predocs:settings before npm run schema:settings and npm run docs:settings.',
        'The recurring rule is never to hand-edit generated settings docs.',
        'The validation step is to confirm the schema artifact and docs changed together after regeneration.',
        'This is the same recurring workflow we use every time a setting changes.',
      ]),
    },
    {
      sessionId: 'distractor-release-notes',
      summary: 'Prepare release notes for auth launch',
      timestampOffsetMinutes: 360,
      memoryScratchpad: undefined,
      userTurns: padTurns([
        'This release-notes task was one-off and just needed manual wording updates.',
        'I edited CHANGELOG.md and docs/release-notes.md directly.',
        'There was no reusable command sequence here beyond proofreading the copy.',
        'This task should not become a standing workflow.',
        'Once the wording landed, we were done.',
      ]),
    },
    {
      sessionId: 'distractor-ci-snapshots',
      summary: 'Investigate CI drift in auth snapshots',
      timestampOffsetMinutes: 330,
      memoryScratchpad: undefined,
      userTurns: padTurns([
        'This auth snapshot issue was specific to a flaky test in CI.',
        'The only commands we ran were npm test -- auth and an isolated snapshot update.',
        'It was not the recurring settings-doc workflow.',
        'Once the flaky snapshot passed, there was no broader reusable procedure.',
        'Treat this as a one-off CI cleanup.',
      ]),
    },
    {
      sessionId: 'distractor-onboarding-docs',
      summary: 'Refresh onboarding documentation copy',
      timestampOffsetMinutes: 300,
      memoryScratchpad: undefined,
      userTurns: padTurns([
        'This was just a docs wording cleanup in docs/onboarding.md.',
        'No command sequence was involved.',
        'We manually edited the copy and reviewed it.',
        'There is no recurring operational workflow to capture here.',
        'This should stay a one-off docs edit.',
      ]),
    },
    {
      sessionId: 'distractor-deploy-copy',
      summary: 'Adjust deployment checklist wording',
      timestampOffsetMinutes: 270,
      memoryScratchpad: undefined,
      userTurns: padTurns([
        'This was a wording-only change to docs/deploy.md.',
        'We did not run a reusable command sequence.',
        'It should not become a skill.',
        'The edit was only for this deploy checklist cleanup.',
        'After the copy change, the task was complete.',
      ]),
    },
  ];

  return {
    sessions,
    relevantSessionIds: [
      'hidden-settings-workflow-a',
      'hidden-settings-workflow-b',
    ],
    distractorSessionIds: [
      'distractor-release-notes',
      'distractor-ci-snapshots',
      'distractor-onboarding-docs',
      'distractor-deploy-copy',
    ],
  };
}

async function seedSessions(
  config: Config,
  sessions: SeedSession[],
): Promise<void> {
  const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
  await fsp.mkdir(chatsDir, { recursive: true });

  const projectRoot = config.storage.getProjectRoot();

  for (const session of sessions) {
    const sessionTimestamp = new Date(
      Date.now() - session.timestampOffsetMinutes * 60 * 1000,
    );
    const timestamp = sessionTimestamp
      .toISOString()
      .slice(0, 16)
      .replace(/:/g, '-');
    const filename = `${SESSION_FILE_PREFIX}${timestamp}-${session.sessionId.slice(0, 8)}.json`;
    const conversation = {
      sessionId: session.sessionId,
      projectHash: getProjectHash(projectRoot),
      summary: session.summary,
      memoryScratchpad: session.memoryScratchpad,
      startTime: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      lastUpdated: sessionTimestamp.toISOString(),
      messages: buildMessages(session.userTurns),
    };

    await fsp.writeFile(
      path.join(chatsDir, filename),
      JSON.stringify(conversation, null, 2),
    );
  }
}

async function runExtractionAndReadState(
  config: Config,
): Promise<ExtractionOutcome> {
  await startMemoryService(config);

  const memoryDir = config.storage.getProjectMemoryTempDir();
  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const statePath = path.join(memoryDir, '.extraction-state.json');

  const raw = await fsp.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw) as {
    runs?: Array<{
      sessionIds?: string[];
      skillsCreated?: string[];
      candidateSessions?: SessionVersion[];
      processedSessions?: SessionVersion[];
      turnCount?: number;
      durationMs?: number;
      terminateReason?: string;
    }>;
  };
  if (!Array.isArray(state.runs) || state.runs.length === 0) {
    throw new Error('Skill extraction finished without writing any run state');
  }

  return {
    state: {
      runs: state.runs.map((run) => ({
        sessionIds: Array.isArray(run.sessionIds) ? run.sessionIds : [],
        skillsCreated: Array.isArray(run.skillsCreated)
          ? run.skillsCreated
          : [],
        candidateSessions: Array.isArray(run.candidateSessions)
          ? run.candidateSessions
          : [],
        processedSessions: Array.isArray(run.processedSessions)
          ? run.processedSessions
          : [],
        turnCount:
          typeof run.turnCount === 'number' ? run.turnCount : undefined,
        durationMs:
          typeof run.durationMs === 'number' ? run.durationMs : undefined,
        terminateReason:
          typeof run.terminateReason === 'string'
            ? run.terminateReason
            : undefined,
      })),
    },
    skillsDir,
    skillBodies: await readSkillBodies(skillsDir),
  };
}

async function summarizeScratchpadRun(
  outcome: ExtractionOutcome,
  run: ExtractionRunSnapshot,
  scenario: ReturnType<typeof createWorkflowComparisonSessions>,
): Promise<ScratchpadRunMetrics> {
  const relevantReads = countMatchingIds(
    run.processedSessions,
    scenario.relevantSessionIds,
  );
  const distractorReads = countMatchingIds(
    run.processedSessions,
    scenario.distractorSessionIds,
  );
  const totalReads = run.processedSessions.length;
  const quality = scoreSkillQuality(
    outcome.skillBodies,
    SETTINGS_SKILL_QUALITY_SIGNALS,
  );

  return {
    turnCount: run.turnCount ?? null,
    durationMs: run.durationMs ?? null,
    terminateReason: run.terminateReason ?? null,
    skillsCreated: run.skillsCreated.length,
    candidateSessions: run.candidateSessions.length,
    processedSessions: totalReads,
    relevantReads,
    distractorReads,
    totalReads,
    recall: relevantReads / scenario.relevantSessionIds.length,
    precision: totalReads === 0 ? 0 : relevantReads / totalReads,
    signalScore: relevantReads - distractorReads,
    skillQualityScore: quality.score,
    skillQualityMax: quality.maxScore,
    skillQualityRatio:
      quality.maxScore === 0 ? 0 : quality.score / quality.maxScore,
    missingQualitySignals: quality.missing,
  };
}

function averageScratchpadRuns(
  runs: ScratchpadRunMetrics[],
): ScratchpadStatsAggregate {
  return {
    turnCountAvg: roundStat(averageNullable(runs.map((run) => run.turnCount))),
    durationMsAvg: roundStat(
      averageNullable(runs.map((run) => run.durationMs)),
    ),
    recallAvg: roundStat(average(runs.map((run) => run.recall))) ?? 0,
    precisionAvg: roundStat(average(runs.map((run) => run.precision))) ?? 0,
    signalScoreAvg: roundStat(average(runs.map((run) => run.signalScore))) ?? 0,
    relevantReadsAvg:
      roundStat(average(runs.map((run) => run.relevantReads))) ?? 0,
    distractorReadsAvg:
      roundStat(average(runs.map((run) => run.distractorReads))) ?? 0,
    skillsCreatedAvg:
      roundStat(average(runs.map((run) => run.skillsCreated))) ?? 0,
    skillQualityScoreAvg:
      roundStat(average(runs.map((run) => run.skillQualityScore))) ?? 0,
    skillQualityRatioAvg:
      roundStat(average(runs.map((run) => run.skillQualityRatio))) ?? 0,
  };
}

function diffScratchpadAggregates(
  baseline: ScratchpadStatsAggregate,
  enhanced: ScratchpadStatsAggregate,
): ScratchpadStatsAggregate {
  return {
    turnCountAvg:
      baseline.turnCountAvg === null || enhanced.turnCountAvg === null
        ? null
        : roundStat(enhanced.turnCountAvg - baseline.turnCountAvg),
    durationMsAvg:
      baseline.durationMsAvg === null || enhanced.durationMsAvg === null
        ? null
        : roundStat(enhanced.durationMsAvg - baseline.durationMsAvg),
    recallAvg: roundStat(enhanced.recallAvg - baseline.recallAvg) ?? 0,
    precisionAvg: roundStat(enhanced.precisionAvg - baseline.precisionAvg) ?? 0,
    signalScoreAvg:
      roundStat(enhanced.signalScoreAvg - baseline.signalScoreAvg) ?? 0,
    relevantReadsAvg:
      roundStat(enhanced.relevantReadsAvg - baseline.relevantReadsAvg) ?? 0,
    distractorReadsAvg:
      roundStat(enhanced.distractorReadsAvg - baseline.distractorReadsAvg) ?? 0,
    skillsCreatedAvg:
      roundStat(enhanced.skillsCreatedAvg - baseline.skillsCreatedAvg) ?? 0,
    skillQualityScoreAvg:
      roundStat(
        enhanced.skillQualityScoreAvg - baseline.skillQualityScoreAvg,
      ) ?? 0,
    skillQualityRatioAvg:
      roundStat(
        enhanced.skillQualityRatioAvg - baseline.skillQualityRatioAvg,
      ) ?? 0,
  };
}

async function runScenarioWithFreshRig(
  sessions: SeedSession[],
): Promise<ExtractionOutcome> {
  const rig = new ComponentRig({
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
  });
  try {
    await rig.initialize();
    await prepareWorkspace(rig.testDir, rig.testDir, WORKSPACE_FILES);
    await seedSessions(rig.config!, sessions);
    return await runExtractionAndReadState(rig.config!);
  } finally {
    await rig.cleanup();
  }
}

async function runScratchpadStatsTrial(
  trial: number,
): Promise<ScratchpadStatsTrial> {
  const baselineScenario = createWorkflowComparisonSessions(false);
  const enhancedScenario = createWorkflowComparisonSessions(true);

  const baselineOutcome = await runScenarioWithFreshRig(
    baselineScenario.sessions,
  );
  const enhancedOutcome = await runScenarioWithFreshRig(
    enhancedScenario.sessions,
  );

  const baselineRun = baselineOutcome.state.runs.at(-1);
  const enhancedRun = enhancedOutcome.state.runs.at(-1);
  if (!baselineRun || !enhancedRun) {
    throw new Error('Expected both baseline and scratchpad runs to exist');
  }

  expectSuccessfulExtractionRun(baselineRun);
  expectSuccessfulExtractionRun(enhancedRun);

  return {
    trial,
    baseline: await summarizeScratchpadRun(
      baselineOutcome,
      baselineRun,
      baselineScenario,
    ),
    enhanced: await summarizeScratchpadRun(
      enhancedOutcome,
      enhancedRun,
      enhancedScenario,
    ),
  };
}

async function runScratchpadStatsReport(
  trials: number,
): Promise<ScratchpadStatsReport> {
  const results: ScratchpadStatsTrial[] = [];

  for (let trial = 1; trial <= trials; trial++) {
    results.push(await runScratchpadStatsTrial(trial));
  }

  const baseline = averageScratchpadRuns(
    results.map((result) => result.baseline),
  );
  const enhanced = averageScratchpadRuns(
    results.map((result) => result.enhanced),
  );

  return {
    generatedAt: new Date().toISOString(),
    trials,
    aggregate: {
      baseline,
      enhanced,
    },
    deltas: diffScratchpadAggregates(baseline, enhanced),
    results,
  };
}

async function writeScratchpadStatsReport(
  report: ScratchpadStatsReport,
): Promise<string> {
  const outputPath = path.resolve(
    process.cwd(),
    'evals/logs/skill_extraction_scratchpad_stats.json',
  );
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

async function readSkillBodies(skillsDir: string): Promise<string[]> {
  const bodies: string[] = [];

  try {
    const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        bodies.push(
          await fsp.readFile(
            path.join(skillsDir, entry.name, 'SKILL.md'),
            'utf-8',
          ),
        );
      } catch {
        // Ignore incomplete skill directories so one bad artifact does not hide
        // valid skills created in the same eval run.
      }
    }
    return bodies;
  } catch {
    return [];
  }
}

function expectSuccessfulExtractionRun(run: ExtractionRunSnapshot): void {
  expect(run.turnCount).toBeGreaterThan(0);
  expect(run.turnCount).toBeLessThanOrEqual(30);
  expect(run.durationMs).toBeGreaterThan(0);
  expect(run.terminateReason).toBe('GOAL');
}

function scoreSkillQuality(
  skillBodies: string[],
  signals: SkillQualitySignal[],
): { score: number; maxScore: number; missing: string[] } {
  const combined = skillBodies.join('\n\n');
  const matched = signals.filter((signal) => signal.pattern.test(combined));

  return {
    score: matched.length,
    maxScore: signals.length,
    missing: signals
      .filter((signal) => !signal.pattern.test(combined))
      .map((signal) => signal.label),
  };
}

const SETTINGS_SKILL_QUALITY_SIGNALS: SkillQualitySignal[] = [
  { label: 'predocs command', pattern: /npm run predocs:settings/i },
  { label: 'schema command', pattern: /npm run schema:settings/i },
  { label: 'docs command', pattern: /npm run docs:settings/i },
  { label: 'verification guidance', pattern: /verif(?:y|ication)/i },
  {
    label: 'generated docs warning or ordering constraint',
    pattern:
      /do not hand-edit|manual edits|exact command order|preserve.*order/i,
  },
];

const DB_MIGRATION_SKILL_QUALITY_SIGNALS: SkillQualitySignal[] = [
  { label: 'db check command', pattern: /npm run db:check/i },
  { label: 'db migrate command', pattern: /npm run db:migrate/i },
  { label: 'db validate command', pattern: /npm run db:validate/i },
  { label: 'rollback guidance', pattern: /npm run db:rollback|rollback/i },
  {
    label: 'ordering constraint',
    pattern: /check.*migrate.*validate|ordering is critical|mandatory/i,
  },
];

/**
 * Shared configOverrides for all skill extraction component evals.
 * - experimentalAutoMemory: enables the Auto Memory skill extraction pipeline.
 * - approvalMode: YOLO auto-approves tool calls (write_file, read_file) so the
 *   background agent can execute without interactive confirmation.
 */
const EXTRACTION_CONFIG_OVERRIDES = {
  experimentalAutoMemory: true,
  approvalMode: ApprovalMode.YOLO,
};

function parseScratchpadStatsTrials(): number {
  const configured = Number.parseInt(
    process.env['SCRATCHPAD_STATS_TRIALS'] ?? '8',
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 8;
}

const SCRATCHPAD_STATS_TRIALS = parseScratchpadStatsTrials();

describe('Skill Extraction', () => {
  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'ignores one-off incidents even when session summaries look similar',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
        {
          sessionId: 'incident-login-redirect',
          summary: 'Debug login redirect loop in staging',
          timestampOffsetMinutes: 420,
          userTurns: [
            'We only need a one-off fix for incident INC-4412 on branch hotfix/login-loop.',
            'The exact failing string is ERR_REDIRECT_4412 and this workaround is incident-specific.',
            'Patch packages/auth/src/redirect.ts just for this branch and do not generalize it.',
            'The thing that worked was deleting the stale staging cookie before retrying.',
            'This is not a normal workflow and should not become a reusable instruction.',
            'It only reproduced against the 2026-04-08 staging rollout.',
            'After the cookie clear, the branch-specific redirect logic passed.',
            'Do not turn this incident writeup into a standing process.',
            'Yes, the hotfix worked for this exact redirect-loop incident.',
            'Close out INC-4412 once the staging login succeeds again.',
          ],
        },
        {
          sessionId: 'incident-login-timeout',
          summary: 'Debug login callback timeout in staging',
          timestampOffsetMinutes: 360,
          userTurns: [
            'This is another one-off staging incident, this time TICKET-991 for callback timeout.',
            'The exact failing string is ERR_CALLBACK_TIMEOUT_991 and it is unrelated to the redirect loop.',
            'The temporary fix was rotating the staging secret and deleting a bad feature-flag row.',
            'Do not write a generic login-debugging playbook from this.',
            'This only applied to the callback timeout during the April rollout.',
            'The successful fix was specific to the stale secret in staging.',
            'It does not define a durable repo workflow for future tasks.',
            'After rotating the secret, the callback timeout stopped reproducing.',
            'Treat this as incident response only, not a reusable skill.',
            'Once staging passed again, we closed TICKET-991.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expect(state.runs[0].skillsCreated).toEqual([]);
      expect(skillBodies).toEqual([]);
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'extracts a repeated project-specific workflow into a skill',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
        {
          sessionId: 'settings-docs-regen-1',
          summary: 'Update settings docs after adding a config option',
          timestampOffsetMinutes: 420,
          userTurns: [
            'When we add a new config option, we have to regenerate the settings docs in a specific order.',
            'The sequence that worked was npm run predocs:settings, npm run schema:settings, then npm run docs:settings.',
            'Do not hand-edit generated settings docs.',
            'If predocs is skipped, the generated schema docs miss the new defaults.',
            'Update the source first, then run that generation sequence.',
            'After regenerating, verify the schema output and docs changed together.',
            'We used this same sequence the last time we touched settings docs.',
            'That ordered workflow passed and produced the expected generated files.',
            'Please keep the exact command order because reversing it breaks the output.',
            'Yes, the generated settings docs were correct after those three commands.',
          ],
        },
        {
          sessionId: 'settings-docs-regen-2',
          summary: 'Regenerate settings schema docs for another new setting',
          timestampOffsetMinutes: 360,
          userTurns: [
            'We are touching another setting, so follow the same settings-doc regeneration workflow again.',
            'Run npm run predocs:settings before npm run schema:settings and npm run docs:settings.',
            'The project keeps generated settings docs in sync through those commands, not manual edits.',
            'Skipping predocs caused stale defaults in the generated output before.',
            'Change the source, then execute the same three commands in order.',
            'Verify both the schema artifact and docs update together after regeneration.',
            'This is the recurring workflow we use whenever a setting changes.',
            'The exact order worked again on this second settings update.',
            'Please preserve that ordering constraint for future settings changes.',
            'Confirmed: the settings docs regenerated correctly with the same command sequence.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);
      const combinedSkills = skillBodies.join('\n\n');
      const quality = scoreSkillQuality(
        skillBodies,
        SETTINGS_SKILL_QUALITY_SIGNALS,
      );

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expectSuccessfulExtractionRun(state.runs[0]);
      expect(state.runs[0].skillsCreated.length).toBeGreaterThanOrEqual(1);
      expect(skillBodies.length).toBeGreaterThanOrEqual(1);
      expect(combinedSkills).toContain('npm run predocs:settings');
      expect(combinedSkills).toContain('npm run schema:settings');
      expect(combinedSkills).toContain('npm run docs:settings');
      expect(combinedSkills).toMatch(/verif(?:y|ication)/i);
      expect(
        quality.score,
        `missing quality signals: ${quality.missing.join(', ')}`,
      ).toBeGreaterThanOrEqual(4);

      // Verify the extraction agent activated skill-creator for design guidance.
      expect(config.getSkillManager().isSkillActive('skill-creator')).toBe(
        true,
      );
    },
  });

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'memory scratchpad improves repeated-workflow recall versus summary-only index',
    files: WORKSPACE_FILES,
    timeout: 360000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    assert: async () => {
      const baselineScenario = createWorkflowComparisonSessions(false);
      const enhancedScenario = createWorkflowComparisonSessions(true);

      const baselineOutcome = await runScenarioWithFreshRig(
        baselineScenario.sessions,
      );
      const enhancedOutcome = await runScenarioWithFreshRig(
        enhancedScenario.sessions,
      );

      const baselineRun = baselineOutcome.state.runs.at(-1);
      const enhancedRun = enhancedOutcome.state.runs.at(-1);
      if (!baselineRun || !enhancedRun) {
        throw new Error('Expected both baseline and scratchpad runs to exist');
      }

      expectSuccessfulExtractionRun(baselineRun);
      expectSuccessfulExtractionRun(enhancedRun);

      const baselineRelevantReads = countMatchingIds(
        baselineRun.processedSessions,
        baselineScenario.relevantSessionIds,
      );
      const enhancedRelevantReads = countMatchingIds(
        enhancedRun.processedSessions,
        enhancedScenario.relevantSessionIds,
      );
      const baselineDistractorReads = countMatchingIds(
        baselineRun.processedSessions,
        baselineScenario.distractorSessionIds,
      );
      const enhancedDistractorReads = countMatchingIds(
        enhancedRun.processedSessions,
        enhancedScenario.distractorSessionIds,
      );
      const baselineSignalScore =
        baselineRelevantReads - baselineDistractorReads;
      const enhancedSignalScore =
        enhancedRelevantReads - enhancedDistractorReads;

      expect(enhancedRun.candidateSessions).toHaveLength(
        enhancedScenario.sessions.length,
      );
      expect(enhancedRelevantReads).toBeGreaterThanOrEqual(2);
      expect(enhancedRelevantReads).toBeGreaterThanOrEqual(
        baselineRelevantReads,
      );
      expect(enhancedDistractorReads).toBeLessThanOrEqual(
        baselineDistractorReads,
      );
      expect(enhancedSignalScore).toBeGreaterThan(baselineSignalScore);
    },
  });

  if (process.env['RUN_SCRATCHPAD_STATS'] === '1') {
    componentEvalTest('USUALLY_PASSES', {
      suiteName: 'skill-extraction',
      suiteType: 'component-level',
      name: 'reports memory scratchpad retrieval statistics',
      timeout: Math.max(360000, SCRATCHPAD_STATS_TRIALS * 150000),
      configOverrides: EXTRACTION_CONFIG_OVERRIDES,
      assert: async () => {
        const report = await runScratchpadStatsReport(SCRATCHPAD_STATS_TRIALS);
        const outputPath = await writeScratchpadStatsReport(report);

        console.info(
          `Wrote scratchpad stats report to ${outputPath}\n${JSON.stringify(
            report.aggregate,
            null,
            2,
          )}`,
        );

        expect(report.results).toHaveLength(SCRATCHPAD_STATS_TRIALS);
        expect(report.aggregate.baseline.recallAvg).toBeGreaterThan(0);
        expect(report.aggregate.enhanced.recallAvg).toBeGreaterThan(0);
      },
    });
  } else {
    it.skip('reports memory scratchpad retrieval statistics', () => {});
  }

  componentEvalTest('USUALLY_PASSES', {
    suiteName: 'skill-extraction',
    suiteType: 'component-level',
    name: 'extracts a repeated multi-step migration workflow with ordering constraints',
    files: WORKSPACE_FILES,
    timeout: 180000,
    configOverrides: EXTRACTION_CONFIG_OVERRIDES,
    setup: async (config) => {
      await seedSessions(config, [
        {
          sessionId: 'db-migration-v12',
          summary: 'Run database migration for v12 schema update',
          timestampOffsetMinutes: 420,
          userTurns: [
            'Every time we change the database schema we follow a specific migration workflow.',
            'First run npm run db:check to verify no pending migrations conflict.',
            'Then run npm run db:migrate to apply the new migration files.',
            'After migration, always run npm run db:validate to confirm schema integrity.',
            'If db:validate fails, immediately run npm run db:rollback before anything else.',
            'Never skip db:check — last time we did, two migrations collided and corrupted the index.',
            'The ordering is critical: check, migrate, validate. Reversing migrate and validate caused silent data loss before.',
            'This v12 migration passed after following that exact sequence.',
            'We use this same three-step workflow every time the schema changes.',
            'Confirmed: db:check, db:migrate, db:validate completed successfully for v12.',
          ],
        },
        {
          sessionId: 'db-migration-v13',
          summary: 'Run database migration for v13 schema update',
          timestampOffsetMinutes: 360,
          userTurns: [
            'New schema change for v13, following the same database migration workflow as before.',
            'Start with npm run db:check to ensure no conflicting pending migrations.',
            'Then npm run db:migrate to apply the v13 migration files.',
            'Then npm run db:validate to confirm the schema is consistent.',
            'If validation fails, run npm run db:rollback immediately — do not attempt manual fixes.',
            'We learned the hard way that skipping db:check causes index corruption.',
            'The check-migrate-validate order is mandatory for every schema change.',
            'This is the same recurring workflow we used for v12 and earlier migrations.',
            'The v13 migration passed with the same three-step sequence.',
            'Confirmed: the standard db migration workflow succeeded again for v13.',
          ],
        },
      ]);
    },
    assert: async (config) => {
      const { state, skillsDir } = await runExtractionAndReadState(config);
      const skillBodies = await readSkillBodies(skillsDir);
      const combinedSkills = skillBodies.join('\n\n');
      const quality = scoreSkillQuality(
        skillBodies,
        DB_MIGRATION_SKILL_QUALITY_SIGNALS,
      );

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0].sessionIds).toHaveLength(2);
      expectSuccessfulExtractionRun(state.runs[0]);
      expect(state.runs[0].skillsCreated.length).toBeGreaterThanOrEqual(1);
      expect(skillBodies.length).toBeGreaterThanOrEqual(1);
      expect(combinedSkills).toContain('npm run db:check');
      expect(combinedSkills).toContain('npm run db:migrate');
      expect(combinedSkills).toContain('npm run db:validate');
      expect(combinedSkills).toMatch(/rollback/i);
      expect(
        quality.score,
        `missing quality signals: ${quality.missing.join(', ')}`,
      ).toBeGreaterThanOrEqual(4);

      // Verify the extraction agent activated skill-creator for design guidance.
      expect(config.getSkillManager().isSkillActive('skill-creator')).toBe(
        true,
      );
    },
  });
});
