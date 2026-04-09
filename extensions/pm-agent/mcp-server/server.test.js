/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for pm-agent MCP server utilities.
 * Run with: node --test extensions/pm-agent/mcp-server/server.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateOwner,
  validateRepo,
  validateLimit,
  validateMonths,
  normalizeLabel,
  categorizeIssues,
  groupCommitsByMonth,
  generateRiskFlags,
  daysAgoISO,
} from './server.js';

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('validateOwner', () => {
  it('accepts valid owner names', () => {
    assert.doesNotThrow(() => validateOwner('google-gemini'));
    assert.doesNotThrow(() => validateOwner('ASekiguchi'));
    assert.doesNotThrow(() => validateOwner('my.org'));
    assert.doesNotThrow(() => validateOwner('a'));
  });

  it('rejects leading hyphen', () => {
    assert.throws(() => validateOwner('-badname'), /Invalid owner/);
  });

  it('rejects shell metacharacters — no injection path', () => {
    assert.throws(() => validateOwner('owner;rm -rf /'), /Invalid owner/);
    assert.throws(() => validateOwner('own&er'), /Invalid owner/);
    assert.throws(() => validateOwner('own|er'), /Invalid owner/);
    assert.throws(() => validateOwner('$(evil)'), /Invalid owner/);
    assert.throws(() => validateOwner('`evil`'), /Invalid owner/);
  });

  it('rejects empty string', () => {
    assert.throws(() => validateOwner(''), /Invalid owner/);
  });

  it('rejects non-string', () => {
    assert.throws(() => validateOwner(null), /Invalid owner/);
    assert.throws(() => validateOwner(42), /Invalid owner/);
  });
});

describe('validateRepo', () => {
  it('accepts valid repo names', () => {
    assert.doesNotThrow(() => validateRepo('gemini-cli'));
    assert.doesNotThrow(() => validateRepo('my_repo'));
    assert.doesNotThrow(() => validateRepo('repo.name'));
    assert.doesNotThrow(() => validateRepo('a'));
  });

  it('rejects shell metacharacters — no injection path', () => {
    assert.throws(() => validateRepo('repo;ls'), /Invalid repo/);
    assert.throws(() => validateRepo('repo&&cmd'), /Invalid repo/);
    assert.throws(() => validateRepo('$(cmd)'), /Invalid repo/);
  });

  it('rejects empty string', () => {
    assert.throws(() => validateRepo(''), /Invalid repo/);
  });
});

describe('validateLimit', () => {
  it('accepts valid limits', () => {
    assert.doesNotThrow(() => validateLimit(1));
    assert.doesNotThrow(() => validateLimit(50));
    assert.doesNotThrow(() => validateLimit(500));
  });

  it('rejects out-of-range values', () => {
    assert.throws(() => validateLimit(0), /Invalid limit/);
    assert.throws(() => validateLimit(501), /Invalid limit/);
    assert.throws(() => validateLimit(-1), /Invalid limit/);
  });

  it('rejects non-integers', () => {
    assert.throws(() => validateLimit(1.5), /Invalid limit/);
    assert.throws(() => validateLimit('50'), /Invalid limit/);
  });
});

describe('validateMonths', () => {
  it('accepts 1–12', () => {
    assert.doesNotThrow(() => validateMonths(1));
    assert.doesNotThrow(() => validateMonths(12));
  });

  it('rejects 0 and 13', () => {
    assert.throws(() => validateMonths(0), /Invalid months/);
    assert.throws(() => validateMonths(13), /Invalid months/);
  });
});

// ---------------------------------------------------------------------------
// Label normalization
// ---------------------------------------------------------------------------

describe('normalizeLabel', () => {
  it('strips kind/ prefix', () => {
    assert.equal(normalizeLabel('kind/bug'), 'bug');
    assert.equal(normalizeLabel('kind/feature'), 'feature');
  });

  it('strips type: prefix', () => {
    assert.equal(normalizeLabel('type:bug'), 'bug');
    assert.equal(normalizeLabel('type:enhancement'), 'enhancement');
  });

  it('strips area/ prefix', () => {
    assert.equal(normalizeLabel('area/docs'), 'docs');
  });

  it('collapses hyphens and underscores to spaces', () => {
    assert.equal(normalizeLabel('feature-request'), 'feature request');
    assert.equal(normalizeLabel('tech_debt'), 'tech debt');
  });

  it('lowercases', () => {
    assert.equal(normalizeLabel('BUG'), 'bug');
    assert.equal(normalizeLabel('Enhancement'), 'enhancement');
  });

  it('handles empty string', () => {
    assert.equal(normalizeLabel(''), '');
  });
});

// ---------------------------------------------------------------------------
// Issue categorization
// ---------------------------------------------------------------------------

describe('categorizeIssues', () => {
  function makeIssue(labels, overrides = {}) {
    return {
      number: 1,
      title: 'Test issue',
      author: { login: 'user' },
      createdAt: '2024-01-01T00:00:00Z',
      comments: [],
      reactionGroups: [],
      labels: labels.map((name) => ({ name })),
      ...overrides,
    };
  }

  it('categorizes feature request labels', () => {
    const result = categorizeIssues([
      makeIssue(['feature']),
      makeIssue(['enhancement']),
      makeIssue(['feature-request']),
      makeIssue(['kind/feature']),
      makeIssue(['type:enhancement']),
    ]);
    assert.equal(result.featureRequests.length, 5);
  });

  it('categorizes bug labels', () => {
    const result = categorizeIssues([
      makeIssue(['bug']),
      makeIssue(['kind/bug']),
      makeIssue(['type:bug']),
      makeIssue(['defect']),
      makeIssue(['regression']),
    ]);
    assert.equal(result.bugs.length, 5);
  });

  it('categorizes UX/UI labels', () => {
    const result = categorizeIssues([
      makeIssue(['ux']),
      makeIssue(['ui']),
      makeIssue(['usability']),
      makeIssue(['ux-feedback']),
    ]);
    assert.equal(result.uxFeedback.length, 4);
  });

  it('categorizes tech debt labels', () => {
    const result = categorizeIssues([
      makeIssue(['tech-debt']),
      makeIssue(['technical-debt']),
      makeIssue(['refactor']),
      makeIssue(['tech debt']),
    ]);
    assert.equal(result.techDebt.length, 4);
  });

  it('categorizes documentation labels', () => {
    const result = categorizeIssues([
      makeIssue(['docs']),
      makeIssue(['documentation']),
      makeIssue(['doc']),
    ]);
    assert.equal(result.documentation.length, 3);
  });

  it('puts unlabeled issues in other', () => {
    const result = categorizeIssues([makeIssue([])]);
    assert.equal(result.other.length, 1);
  });

  it('handles empty input', () => {
    const result = categorizeIssues([]);
    assert.equal(result.featureRequests.length, 0);
    assert.equal(result.other.length, 0);
  });

  it('counts reactions from reactionGroups', () => {
    const issue = makeIssue(['bug'], {
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 10 } },
        { content: 'HEART', users: { totalCount: 5 } },
      ],
    });
    const result = categorizeIssues([issue]);
    assert.equal(result.bugs[0].reactionCount, 15);
  });

  it('uses case-insensitive matching', () => {
    const result = categorizeIssues([
      makeIssue(['Bug']),
      makeIssue(['FEATURE']),
      makeIssue(['Documentation']),
    ]);
    assert.equal(result.bugs.length, 1);
    assert.equal(result.featureRequests.length, 1);
    assert.equal(result.documentation.length, 1);
  });

  it('handles missing optional fields gracefully', () => {
    const bare = { number: 99, title: 'bare issue' };
    assert.doesNotThrow(() => categorizeIssues([bare]));
    const result = categorizeIssues([bare]);
    assert.equal(result.other.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Commit velocity grouping
// ---------------------------------------------------------------------------

describe('groupCommitsByMonth', () => {
  it('returns correct period count', () => {
    const result = groupCommitsByMonth([], 3);
    assert.equal(result.length, 3);
  });

  it('labels first period as current month', () => {
    const result = groupCommitsByMonth([], 3);
    assert.equal(result[0].period, 'current month');
    assert.equal(result[1].period, '1 month(s) ago');
    assert.equal(result[2].period, '2 month(s) ago');
  });

  it('counts a recent commit in current month', () => {
    const recentDate = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = groupCommitsByMonth([recentDate], 3);
    assert.equal(result[0].commits, 1);
    assert.equal(result[1].commits, 0);
  });

  it('counts an older commit in the correct past period', () => {
    const oldDate = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = groupCommitsByMonth([oldDate], 3);
    assert.equal(result[0].commits, 0);
    assert.equal(result[1].commits, 1);
  });

  it('ignores commits outside the analysis window', () => {
    const tooOld = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = groupCommitsByMonth([tooOld], 3);
    const total = result.reduce((s, p) => s + p.commits, 0);
    assert.equal(total, 0);
  });

  it('handles empty input without throwing', () => {
    const result = groupCommitsByMonth([], 6);
    assert.equal(result.length, 6);
    assert.equal(
      result.every((p) => p.commits === 0),
      true,
    );
  });

  it('ignores invalid date strings', () => {
    assert.doesNotThrow(() => groupCommitsByMonth(['not-a-date', '', null], 1));
  });
});

// ---------------------------------------------------------------------------
// Risk flag generation
// ---------------------------------------------------------------------------

describe('generateRiskFlags', () => {
  function baseHealth(overrides = {}) {
    return {
      issues: { open: 10, closedLast30Days: 5, ...overrides.issues },
      pullRequests: { open: 2, mergedLast30Days: 3, ...overrides.pullRequests },
      velocity: { direction: 'stable', ...overrides.velocity },
      community: { activeContributors: 10, ...overrides.community },
    };
  }

  it('returns no flags for a healthy project', () => {
    const flags = generateRiskFlags(baseHealth());
    assert.equal(flags.length, 0);
  });

  it('flags high open issue count', () => {
    const flags = generateRiskFlags(
      baseHealth({ issues: { open: 101, closedLast30Days: 5 } }),
    );
    assert.ok(flags.some((f) => /high open issue/i.test(f)));
  });

  it('flags decelerating velocity', () => {
    const flags = generateRiskFlags(
      baseHealth({ velocity: { direction: 'decelerating' } }),
    );
    assert.ok(flags.some((f) => /velocity declining/i.test(f)));
  });

  it('flags low contributor count', () => {
    const flags = generateRiskFlags(
      baseHealth({ community: { activeContributors: 2 } }),
    );
    assert.ok(flags.some((f) => /bus factor/i.test(f)));
  });

  it('flags no issues closed in 30 days', () => {
    const flags = generateRiskFlags(
      baseHealth({ issues: { open: 10, closedLast30Days: 0 } }),
    );
    assert.ok(flags.some((f) => /no issues closed/i.test(f)));
  });

  it('flags no PRs merged in 30 days', () => {
    const flags = generateRiskFlags(
      baseHealth({ pullRequests: { open: 1, mergedLast30Days: 0 } }),
    );
    assert.ok(flags.some((f) => /no prs merged/i.test(f)));
  });

  it('can raise multiple flags simultaneously', () => {
    const flags = generateRiskFlags(
      baseHealth({
        issues: { open: 200, closedLast30Days: 0 },
        velocity: { direction: 'decelerating' },
        community: { activeContributors: 1 },
        pullRequests: { open: 0, mergedLast30Days: 0 },
      }),
    );
    assert.ok(flags.length >= 4);
  });
});

// ---------------------------------------------------------------------------
// daysAgoISO
// ---------------------------------------------------------------------------

describe('daysAgoISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = daysAgoISO(30);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a date in the past', () => {
    const result = new Date(daysAgoISO(30));
    assert.ok(result < new Date());
  });

  it('is approximately N days ago', () => {
    const result = new Date(daysAgoISO(30));
    const diffDays = (Date.now() - result.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(diffDays >= 29 && diffDays <= 31);
  });
});
