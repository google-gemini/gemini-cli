/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PM Agent MCP Server
 *
 * Provides Product Management tools for the Gemini CLI PM Agent extension.
 *
 * Security model:
 *   - All gh CLI calls use execFile with an explicit argv array.
 *   - No user input is ever interpolated into shell command strings.
 *   - Inputs are validated before use.
 *
 * Repository targeting:
 *   - Every tool that fetches GitHub data requires explicit `owner` and `repo`
 *     parameters. The local working directory is never inspected.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile as execFileCb } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Input validation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * GitHub owner/org: alphanumeric, hyphens, dots — no leading hyphen.
 * @param {string} owner
 */
export function validateOwner(owner) {
  if (
    typeof owner !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(owner)
  ) {
    throw new Error(`Invalid owner: "${owner}"`);
  }
}

/**
 * GitHub repo name: alphanumeric, hyphens, dots, underscores.
 * @param {string} repo
 */
export function validateRepo(repo) {
  if (typeof repo !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(repo)) {
    throw new Error(`Invalid repo: "${repo}"`);
  }
}

/**
 * Issue list limit: integer in [1, 500].
 * @param {number} limit
 */
export function validateLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error(`Invalid limit: ${limit}. Must be an integer 1–500.`);
  }
}

/**
 * Analysis window: integer in [1, 12].
 * @param {number} months
 */
export function validateMonths(months) {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error(`Invalid months: ${months}. Must be an integer 1–12.`);
  }
}

// ---------------------------------------------------------------------------
// Label normalization and categorization (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Normalize a raw GitHub label name into a canonical lowercase string
 * suitable for deterministic matching.
 *
 * Strips common prefix conventions (kind/, type:, area/, category/) and
 * collapses separators so "kind/bug", "type:bug", "bug-report" all
 * normalize to a form that the category matchers can handle consistently.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLabel(raw) {
  return raw
    .toLowerCase()
    .replace(/^(kind|type|area|category)[/:]/i, '') // strip prefix conventions
    .replace(/[-_/]/g, ' ') // unify separators
    .trim();
}

/**
 * Category matchers — applied in priority order.
 * Each entry has a `category` key and a `test` function.
 * The first matching category wins.
 *
 * Patterns are intentionally broad to cover real-world label taxonomies
 * (e.g., "feature request", "feature-request", "kind/feature",
 *  "type:enhancement", "new feature").
 */
export const CATEGORY_MATCHERS = [
  {
    category: 'bugs',
    test: (label) =>
      /\bbug\b|\bdefect\b|\bregression\b|\bcrash\b|\bfailure\b/.test(label),
  },
  {
    category: 'featureRequests',
    test: (label) =>
      /\bfeature\b|\benhancement\b|\bproposal\b|\bfeat\b|\bnew feature\b/.test(
        label,
      ),
  },
  {
    category: 'uxFeedback',
    test: (label) =>
      /\bux\b|\bui\b|\busabilit|\bdesign\b|\baccessib/.test(label),
  },
  {
    category: 'techDebt',
    test: (label) =>
      /\btech\s*debt\b|\btechnical\s*debt\b|\brefactor\b|\bcleanup\b|\bchore\b/.test(
        label,
      ),
  },
  {
    category: 'documentation',
    test: (label) =>
      /\bdocs?\b|\bdocumentation\b|\breadme\b|\bchangelog\b/.test(label),
  },
];

/**
 * Categorize a flat array of GitHub issue objects into PM-relevant groups.
 *
 * @param {object[]} issues
 * @returns {{
 *   featureRequests: object[],
 *   bugs: object[],
 *   uxFeedback: object[],
 *   techDebt: object[],
 *   documentation: object[],
 *   other: object[]
 * }}
 */
export function categorizeIssues(issues) {
  const result = {
    featureRequests: [],
    bugs: [],
    uxFeedback: [],
    techDebt: [],
    documentation: [],
    other: [],
  };

  for (const issue of issues) {
    const rawLabels = Array.isArray(issue.labels) ? issue.labels : [];
    const normalizedLabels = rawLabels.map((l) =>
      normalizeLabel(typeof l === 'string' ? l : l.name || ''),
    );

    const totalReactions = (issue.reactionGroups || []).reduce(
      (sum, g) => sum + ((g.users && g.users.totalCount) || 0),
      0,
    );

    const enriched = {
      number: issue.number,
      title: issue.title || '',
      author: (issue.author && issue.author.login) || 'unknown',
      createdAt: issue.createdAt || null,
      commentCount: Array.isArray(issue.comments)
        ? issue.comments.length
        : typeof issue.comments === 'number'
          ? issue.comments
          : 0,
      reactionCount: totalReactions,
      labels: rawLabels.map((l) => (typeof l === 'string' ? l : l.name || '')),
    };

    let matched = false;
    for (const matcher of CATEGORY_MATCHERS) {
      if (normalizedLabels.some((label) => matcher.test(label))) {
        result[matcher.category].push(enriched);
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.other.push(enriched);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Commit velocity helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Given an array of ISO date strings, count commits per 30-day period.
 * Period 0 = current 30 days, period 1 = previous 30 days, etc.
 *
 * @param {string[]} dates - ISO date strings
 * @param {number} months  - number of 30-day periods to produce
 * @returns {{ period: string, commits: number }[]}
 */
export function groupCommitsByMonth(dates, months) {
  const now = Date.now();
  const MS_PER_PERIOD = 30 * 24 * 60 * 60 * 1000;

  const periods = Array.from({ length: months }, (_, i) => ({
    period: i === 0 ? 'current month' : `${i} month(s) ago`,
    commits: 0,
    start: now - (i + 1) * MS_PER_PERIOD,
    end: now - i * MS_PER_PERIOD,
  }));

  for (const dateStr of dates) {
    if (!dateStr) continue;
    const ts = new Date(dateStr).getTime();
    if (Number.isNaN(ts)) continue;
    for (const p of periods) {
      if (ts >= p.start && ts < p.end) {
        p.commits++;
        break;
      }
    }
  }

  return periods.map(({ period, commits }) => ({ period, commits }));
}

// ---------------------------------------------------------------------------
// Risk flag generation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Derive risk flags from an aggregated health object.
 * Null metric values (indicating fetch failure) are treated conservatively:
 * a null value never suppresses a flag.
 *
 * @param {{ issues, pullRequests, velocity, community }} health
 * @returns {string[]}
 */
export function generateRiskFlags(health) {
  const flags = [];

  if (health.issues.open !== null && health.issues.open > 100) {
    flags.push(
      'High open issue count — may indicate backlog management issues',
    );
  }
  if (health.velocity && health.velocity.direction === 'decelerating') {
    flags.push(
      'Commit velocity declining — check for contributor burnout or blockers',
    );
  }
  if (
    health.community &&
    health.community.activeContributors !== null &&
    health.community.activeContributors < 3
  ) {
    flags.push('Low contributor count — bus factor risk');
  }
  if (
    health.issues.closedLast30Days !== null &&
    health.issues.closedLast30Days === 0
  ) {
    flags.push('No issues closed in 30 days — issue resolution may be stalled');
  }
  if (
    health.pullRequests &&
    health.pullRequests.mergedLast30Days !== null &&
    health.pullRequests.mergedLast30Days === 0
  ) {
    flags.push('No PRs merged in 30 days — development may be stalled');
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Date utilities (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Returns a YYYY-MM-DD date string for N days ago.
 * @param {number} days
 * @returns {string}
 */
export function daysAgoISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// gh CLI wrapper — no shell; argv array only
// ---------------------------------------------------------------------------

/**
 * Run `gh` with the given argv array. Returns trimmed stdout as a string.
 *
 * Throws a descriptive Error on failure; never returns an error string
 * that downstream code might silently coerce to 0.
 *
 * @param {string[]} args
 * @returns {Promise<string>}
 */
export async function runGh(args) {
  let stdout;
  try {
    const result = await execFile('gh', args, {
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (error) {
    const msg = (error.stderr || error.message || '').toString();
    if (error.code === 'ENOENT') {
      throw new Error(
        'gh CLI not found on PATH. Install from https://cli.github.com/ then run `gh auth login`.',
      );
    }
    if (/401|authentication required|not logged in/i.test(msg)) {
      throw new Error('gh is not authenticated. Run: gh auth login');
    }
    if (/404|not found|could not resolve/i.test(msg)) {
      throw new Error(
        'Repository not found or you lack read access. Check owner/repo and gh auth status.',
      );
    }
    if (/rate limit/i.test(msg)) {
      throw new Error(
        'GitHub API rate limit exceeded. Wait a few minutes and retry.',
      );
    }
    throw new Error(`gh error: ${msg.slice(0, 400)}`);
  }
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// GitHub Search helper — accurate counts without per-page cap
// ---------------------------------------------------------------------------

/**
 * Return the total_count for a GitHub search/issues query.
 * Does not paginate — total_count is returned in the first response.
 *
 * @param {string} query - GitHub search query (spaces OK, no shell)
 * @returns {Promise<number>}
 */
async function searchIssueCount(query) {
  const raw = await runGh([
    'api',
    'search/issues',
    '-f',
    `q=${query}`,
    '--jq',
    '.total_count',
  ]);
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(
      `Unexpected response from search API for query "${query}": ${raw.slice(0, 100)}`,
    );
  }
  return n;
}

// ---------------------------------------------------------------------------
// Pagination helper — sum counts across --paginate pages
// ---------------------------------------------------------------------------

/**
 * Run a paginated gh api command with a --jq expression that returns a
 * numeric count per page. Returns the sum across all pages.
 *
 * @param {string[]} args - gh argv (must not include --jq; that is added here)
 * @param {string} jqExpr - jq expression returning a number per page
 * @returns {Promise<number>}
 */
async function pagedCount(args, jqExpr) {
  const raw = await runGh([...args, '--paginate', '--jq', jqExpr]);
  return raw
    .split('\n')
    .filter(Boolean)
    .reduce((acc, line) => {
      const n = parseInt(line.trim(), 10);
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'pm-agent',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tool: analyze_project_issues
// ---------------------------------------------------------------------------

server.registerTool(
  'analyze_project_issues',
  {
    title: 'Analyze Project Issues',
    description:
      'Fetches and categorizes GitHub Issues for PM analysis. ' +
      'Returns issues grouped by type (feature request, bug, UX feedback, ' +
      'tech debt, documentation) with reaction and comment counts. ' +
      'Label categorization uses normalized matching that handles common ' +
      'prefix conventions like kind/, type:, area/.',
    inputSchema: z.object({
      owner: z.string().describe('Repository owner (e.g. "google-gemini")'),
      repo: z.string().describe('Repository name (e.g. "gemini-cli")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(50)
        .describe('Maximum issues to fetch (1–500, default 50)'),
      labels: z
        .string()
        .optional()
        .describe('Comma-separated labels to filter by (optional)'),
      state: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .default('open')
        .describe('Issue state filter (default: open)'),
    }).shape,
  },
  async ({ owner, repo, limit, labels, state }) => {
    validateOwner(owner);
    validateRepo(repo);
    validateLimit(limit);

    const args = [
      'issue',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--limit',
      String(limit),
      '--state',
      state,
      '--json',
      'number,title,labels,createdAt,updatedAt,comments,reactionGroups,author',
    ];
    if (labels) {
      args.push('--label', labels);
    }

    const raw = await runGh(args);

    let issues;
    try {
      issues = JSON.parse(raw);
    } catch {
      throw new Error(
        `Failed to parse gh issue list output: ${raw.slice(0, 200)}`,
      );
    }

    if (!Array.isArray(issues)) {
      throw new Error('Expected an array from gh issue list.');
    }

    const categorized = categorizeIssues(issues);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              meta: {
                repo: `${owner}/${repo}`,
                state,
                fetched: issues.length,
                analysisNote:
                  issues.length === limit
                    ? `Result capped at limit=${limit}. Increase limit for more coverage.`
                    : null,
              },
              summary: {
                total: issues.length,
                breakdown: {
                  featureRequests: categorized.featureRequests.length,
                  bugs: categorized.bugs.length,
                  uxFeedback: categorized.uxFeedback.length,
                  techDebt: categorized.techDebt.length,
                  documentation: categorized.documentation.length,
                  other: categorized.other.length,
                },
              },
              categorized,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: analyze_commit_velocity
// ---------------------------------------------------------------------------

server.registerTool(
  'analyze_commit_velocity',
  {
    title: 'Analyze Commit Velocity',
    description:
      'Fetches commit history for a GitHub repository via the GitHub API ' +
      'and reports velocity trends over configurable time periods. ' +
      'Does NOT inspect the local extension directory or any local git repo.',
    inputSchema: z.object({
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      months: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .default(3)
        .describe('Number of 30-day periods to analyze (1–12, default 3)'),
    }).shape,
  },
  async ({ owner, repo, months }) => {
    validateOwner(owner);
    validateRepo(repo);
    validateMonths(months);

    const since = new Date(
      Date.now() - months * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fetch all commit author dates for the analysis window.
    // --paginate with --jq '[.[].commit.author.date]' outputs one JSON
    // array per page (one line per page). We merge them in JS.
    const raw = await runGh([
      'api',
      `repos/${owner}/${repo}/commits`,
      '-f',
      `since=${since}`,
      '-f',
      'per_page=100',
      '--paginate',
      '--jq',
      '[.[].commit.author.date]',
    ]);

    const dates = raw
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return [];
        }
      });

    const periods = groupCommitsByMonth(dates, months);
    const currentCommits = periods[0]?.commits ?? 0;
    const previousCommits = periods[1]?.commits ?? 0;
    const velocityChange =
      previousCommits > 0
        ? ((currentCommits - previousCommits) / previousCommits) * 100
        : 0;

    const direction =
      velocityChange > 10
        ? 'accelerating'
        : velocityChange < -10
          ? 'decelerating'
          : 'stable';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              meta: {
                repo: `${owner}/${repo}`,
                analysisWindowDays: months * 30,
                totalCommitsAnalyzed: dates.length,
              },
              periods,
              trend: {
                direction,
                velocityChange: `${velocityChange > 0 ? '+' : ''}${velocityChange.toFixed(1)}%`,
                interpretation:
                  periods.length < 2
                    ? 'Insufficient periods for trend analysis'
                    : `Comparing ${periods[0].period} (${currentCommits}) vs ${periods[1].period} (${previousCommits})`,
              },
              averageCommitsPerMonth: Math.round(dates.length / months),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: check_project_health
// ---------------------------------------------------------------------------

server.registerTool(
  'check_project_health',
  {
    title: 'Check Project Health',
    description:
      'Aggregates project health metrics for a GitHub repository. ' +
      'Uses the GitHub Search API for accurate issue and PR counts (not ' +
      'subject to gh list pagination caps). Commit velocity is fetched via ' +
      'the GitHub Commits API — local git is never used. ' +
      'Failures in individual metrics are surfaced in dataErrors rather ' +
      'than silently converted to zero.',
    inputSchema: z.object({
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
    }).shape,
  },
  async ({ owner, repo }) => {
    validateOwner(owner);
    validateRepo(repo);

    const repoSlug = `${owner}/${repo}`;
    const thirtyDaysAgo = daysAgoISO(30);
    const sixtyDaysAgo = daysAgoISO(60);

    // Collect partial failures without failing the whole tool.
    const dataErrors = [];
    async function safe(label, fn) {
      try {
        return await fn();
      } catch (err) {
        dataErrors.push({ metric: label, error: err.message });
        return null;
      }
    }

    // Issue and PR counts: use GitHub Search API — no per-page cap.
    const [openIssues, closedLast30, openPRs, mergedLast30] = await Promise.all(
      [
        safe('openIssues', () =>
          searchIssueCount(`repo:${repoSlug} is:issue state:open`),
        ),
        safe('closedIssuesLast30Days', () =>
          searchIssueCount(
            `repo:${repoSlug} is:issue is:closed closed:>=${thirtyDaysAgo}`,
          ),
        ),
        safe('openPRs', () =>
          searchIssueCount(`repo:${repoSlug} is:pr state:open`),
        ),
        safe('mergedPRsLast30Days', () =>
          searchIssueCount(
            `repo:${repoSlug} is:pr is:merged merged:>=${thirtyDaysAgo}`,
          ),
        ),
      ],
    );

    // Commit velocity: GitHub Commits API, not local git.
    const commitArgs = (since, until) => {
      const args = [
        'api',
        `repos/${repoSlug}/commits`,
        '-f',
        `since=${since}T00:00:00Z`,
        '-f',
        'per_page=100',
      ];
      if (until) args.push('-f', `until=${until}T00:00:00Z`);
      return args;
    };

    const [thisMonth, lastMonth, contributorCount] = await Promise.all([
      safe('commitsThisMonth', () =>
        pagedCount(commitArgs(thirtyDaysAgo), '[.[].sha] | length'),
      ),
      safe('commitsLastMonth', () =>
        pagedCount(
          commitArgs(sixtyDaysAgo, thirtyDaysAgo),
          '[.[].sha] | length',
        ),
      ),
      // Active contributors: unique authors in the past 30 days.
      // Each page returns unique-within-page count; we take the max page
      // as a lower-bound approximation (cross-page deduplication would
      // require collecting all logins, which is expensive for large repos).
      safe('activeContributors', async () => {
        const raw = await runGh([
          ...commitArgs(thirtyDaysAgo),
          '--paginate',
          '--jq',
          '[.[].author.login] | unique | length',
        ]);
        const nums = raw
          .split('\n')
          .filter(Boolean)
          .map((l) => parseInt(l.trim(), 10))
          .filter((n) => !Number.isNaN(n));
        return nums.length > 0 ? Math.max(...nums) : 0;
      }),
    ]);

    const velocityChange =
      lastMonth !== null && lastMonth > 0 && thisMonth !== null
        ? ((thisMonth - lastMonth) / lastMonth) * 100
        : null;

    const health = {
      meta: {
        repo: repoSlug,
        analysisDate: new Date().toISOString().slice(0, 10),
        partialData: dataErrors.length > 0,
      },
      issues: {
        open: openIssues,
        closedLast30Days: closedLast30,
      },
      pullRequests: {
        open: openPRs,
        mergedLast30Days: mergedLast30,
      },
      velocity: {
        commitsThisMonth: thisMonth,
        commitsLastMonth: lastMonth,
        trend:
          velocityChange !== null
            ? `${velocityChange > 0 ? '+' : ''}${velocityChange.toFixed(1)}%`
            : 'unavailable',
        direction:
          velocityChange === null
            ? 'unknown'
            : velocityChange > 10
              ? 'accelerating'
              : velocityChange < -10
                ? 'decelerating'
                : 'stable',
      },
      community: {
        activeContributors: contributorCount,
        note: 'activeContributors is a lower-bound estimate (unique within the largest single page of commits)',
      },
      riskFlags: [],
    };

    health.riskFlags = generateRiskFlags(health);

    if (dataErrors.length > 0) {
      health.dataErrors = dataErrors;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Entry point — only when run directly; not when imported for tests
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
