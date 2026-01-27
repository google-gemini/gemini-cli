/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { Config} from '@google/gemini-cli-core';
import { debugLogger, spawnAsync } from '@google/gemini-cli-core';
import { useKeypress } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';

interface Issue {
  number: number;
  title: string;
  body: string;
  url: string;
  author: { login: string };
  labels: Array<{ name: string }>;
  comments: Array<{ body: string; author: { login: string } }>;
  reactionGroups: Array<{ content: string; users: { totalCount: number } }>;
}

interface Candidate extends Issue {
  score?: number;
  recommendation?: string;
  reason?: string;
}

interface RankedCandidateInfo {
  number: number;
  score: number;
  reason: string;
}

interface GeminiRecommendation {
  recommendation: 'duplicate' | 'canonical' | 'not-duplicate' | 'skip';
  canonical_issue_number?: number;
  reason?: string;
  suggested_comment?: string;
  ranked_candidates?: RankedCandidateInfo[];
}

interface TriageState {
  status: 'loading' | 'analyzing' | 'interaction' | 'completed' | 'error';
  message?: string;
  currentIssue?: Issue;
  candidates?: Candidate[];
  canonicalIssue?: Candidate; // The suggested duplicate target
  issues: Issue[];
  currentIndex: number;
  totalIssues: number;
  suggestedComment?: string;
}

// UI State for navigation
type FocusSection = 'target' | 'candidates' | 'candidate_detail';

const VISIBLE_LINES_COLLAPSED = 6;
const VISIBLE_LINES_EXPANDED = 20;
const VISIBLE_LINES_DETAIL = 25;
const VISIBLE_CANDIDATES = 5;

const getReactionCount = (issue: Issue | Candidate | undefined) => {
  if (!issue || !issue.reactionGroups) return 0;
  return issue.reactionGroups.reduce(
    (acc, group) => acc + group.users.totalCount,
    0,
  );
};

export const TriageDuplicates = ({
  config,
  onExit,
}: {
  config: Config;
  onExit: () => void;
}) => {
  const [state, setState] = useState<TriageState>({
    status: 'loading',
    issues: [],
    currentIndex: 0,
    totalIssues: 0,
    message: 'Fetching issues...',
  });

  // UI Navigation State
  const [focusSection, setFocusSection] = useState<FocusSection>('target');
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [targetExpanded, setTargetExpanded] = useState(false);
  const [targetScrollOffset, setTargetScrollOffset] = useState(0);
  const [candidateScrollOffset, setCandidateScrollOffset] = useState(0);
  const [inputAction, setInputAction] = useState<string>('');

  // Derived state for candidate list scrolling
  const [candidateListScrollOffset, setCandidateListScrollOffset] = useState(0);

  // Keep selected candidate in view
  useEffect(() => {
    if (selectedCandidateIndex < candidateListScrollOffset) {
      setCandidateListScrollOffset(selectedCandidateIndex);
    } else if (
      selectedCandidateIndex >=
      candidateListScrollOffset + VISIBLE_CANDIDATES
    ) {
      setCandidateListScrollOffset(
        selectedCandidateIndex - VISIBLE_CANDIDATES + 1,
      );
    }
  }, [selectedCandidateIndex, candidateListScrollOffset]);

  const resetUiState = useCallback(() => {
    setFocusSection('target');
    setSelectedCandidateIndex(0);
    setCandidateListScrollOffset(0);
    setTargetExpanded(false);
    setTargetScrollOffset(0);
    setCandidateScrollOffset(0);
    setInputAction('');
  }, []);

  const fetchCandidateDetails = async (
    number: number,
  ): Promise<Candidate | null> => {
    try {
      const { stdout } = await spawnAsync('gh', [
        'issue',
        'view',
        String(number),
        '--json',
        'number,title,body,labels,url,comments,author,reactionGroups',
      ]);
      return JSON.parse(stdout) as Candidate;
    } catch (err) {
      debugLogger.error(
        `Failed to fetch details for candidate #${number}`,
        err,
      );
      return null;
    }
  };

  const processIssue = useCallback(
    async (issue: Issue) => {
      resetUiState();
      setState((s) => ({
        ...s,
        status: 'analyzing',
        currentIssue: issue,
        message: `Analyzing issue #${issue.number}... (Press Esc to cancel)`,
      }));

      // Find the comment with potential duplicates
      const dupComment = issue.comments.find((c) =>
        c.body.includes('Found possible duplicate issues:'),
      );

      if (!dupComment) {
        setState((s) => ({
          ...s,
          status: 'interaction',
          candidates: [],
          message: 'No automatic duplicate candidates found in comments.',
        }));
        return;
      }

      // Extract candidate numbers from comment
      const lines = dupComment.body.split('\n');
      const candidateNumbers: number[] = [];
      for (const line of lines) {
        const match = line.match(/#(\d+)/);
        if (match) {
          const number = parseInt(match[1], 10);
          if (number !== issue.number) {
            candidateNumbers.push(number);
          }
        }
      }

      if (candidateNumbers.length === 0) {
        setState((s) => ({
          ...s,
          status: 'interaction',
          candidates: [],
          message:
            'No candidate numbers found in the "possible duplicate" comment.',
        }));
        return;
      }

      // Fetch details for all candidates
      setState((s) => ({
        ...s,
        message: `Fetching details for ${candidateNumbers.length} candidates... (Press Esc to cancel)`,
      }));
      const candidates: Candidate[] = [];
      for (const num of candidateNumbers) {
        const details = await fetchCandidateDetails(num);
        if (details) candidates.push(details);
      }

      // Use LLM to analyze and rank
      try {
        const client = config.getBaseLlmClient();
        const prompt = `
I am triaging a GitHub issue labeled as 'possible-duplicate'. I need to decide if it should be marked as a duplicate of another issue, or if one of the other issues should be marked as a duplicate of this one.

TARGET ISSUE:
#${issue.number}: ${issue.title}
Author: ${issue.author?.login}
Reactions: ${getReactionCount(issue)}
Body: ${issue.body.slice(0, 8000)}...

CANDIDATES:
${candidates
  .map(
    (c) => `
ID: #${c.number}
Title: ${c.title}
Author: ${c.author?.login}
Reactions: ${getReactionCount(c)}
Body: ${c.body.slice(0, 4000)}...
`,
  )
  .join('\n')}

INSTRUCTIONS:
1. Compare the target issue with each candidate.
2. Determine if they are semantically the same bug or feature request.
3. Choose the BEST "canonical" issue. First, verify they are the same issue with the same underlying problem. Then choose the one that:
   - Has the most useful info (detailed report, debug logs, reproduction steps).
   - Has more community interest (reactions).
   - Was created earlier (usually, but quality trumps age).
   - If the target issue is better than all candidates, it might be the canonical one, and we should mark candidates as duplicates of IT (though for this tool, we mostly focus on deciding what to do with the target).
4. Rank the candidates by similarity and quality.

Return a JSON object with:
- "recommendation": "duplicate" (target is duplicate of a candidate), "canonical" (candidates should be duplicates of target - NOT SUPPORTED YET in UI but good to know), "not-duplicate" (keep both), or "skip".
- "canonical_issue_number": number (the one we should point to).
- "reason": short explanation of why this was chosen.
- "suggested_comment": a short, friendly comment (e.g., "Closing as a duplicate of #123. Please follow that issue for updates.")
- "ranked_candidates": array of { "number": number, "score": 0-100, "reason": string }
`;
        setState((s) => ({
          ...s,
          message: `Analyzing with Gemini... (Press Esc to cancel)`,
        }));
        const response = await client.generateJson({
          modelConfigKey: {
            model: 'gemini-3-flash-preview',
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          schema: {
            type: 'object',
            properties: {
              recommendation: {
                type: 'string',
                enum: ['duplicate', 'canonical', 'not-duplicate', 'skip'],
              },
              canonical_issue_number: { type: 'number' },
              reason: { type: 'string' },
              suggested_comment: { type: 'string' },
              ranked_candidates: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'number' },
                    score: { type: 'number' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          abortSignal: new AbortController().signal,
          promptId: 'triage-duplicates',
        });

        const rec = response as unknown as GeminiRecommendation;

        let canonical: Candidate | undefined;
        if (rec.canonical_issue_number) {
          canonical = candidates.find(
            (c) => c.number === rec.canonical_issue_number,
          );
          if (!canonical) {
            canonical = {
              number: rec.canonical_issue_number,
              title: 'Unknown',
              url: '',
            } as Candidate;
          }
          canonical.reason = rec.reason;
        }

        const ranked = candidates
          .map((c) => {
            const rankInfo = rec.ranked_candidates?.find(
              (r) => r.number === c.number,
            );
            return {
              ...c,
              score: rankInfo?.score || 0,
              reason: rankInfo?.reason || '',
            };
          })
          .sort((a, b) => (b.score || 0) - (a.score || 0));

        setState((s) => ({
          ...s,
          status: 'interaction',
          candidates: ranked,
          canonicalIssue: canonical,
          suggestedComment: rec.suggested_comment,
          message: `Recommendation: ${rec.recommendation}. ${rec.reason}`,
        }));
      } catch (err) {
        debugLogger.error('LLM analysis failed', err);
        setState((s) => ({
          ...s,
          status: 'interaction',
          candidates,
          message: 'LLM analysis failed. Please triage manually.',
        }));
      }
    },
    [config, resetUiState],
  );

  const fetchIssues = useCallback(
    async (limit = 50) => {
      try {
        const { stdout } = await spawnAsync('gh', [
          'issue',
          'list',
          '--label',
          'status/possible-duplicate',
          '--state',
          'open',
          '--json',
          'number,title,body,labels,url,comments,author,reactionGroups',
          '--limit',
          String(limit),
        ]);
        const issues: Issue[] = JSON.parse(stdout);
        if (issues.length === 0) {
          setState((s) => ({
            ...s,
            status: 'completed',
            message: 'No issues found with status/possible-duplicate label.',
          }));
          return;
        }
        setState((s) => ({
          ...s,
          issues,
          totalIssues: issues.length,
          currentIndex: 0,
          status: 'analyzing',
          message: `Found ${issues.length} issues. Analyzing first issue...`,
        }));
        void processIssue(issues[0]);
      } catch (error) {
        setState((s) => ({
          ...s,
          status: 'error',
          message: `Error fetching issues: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    },
    [processIssue],
  );

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  const handleNext = useCallback(() => {
    const nextIndex = state.currentIndex + 1;
    if (nextIndex < state.issues.length) {
      // Reset UI state implicitly done in processIssue
      setState((s) => ({
        ...s,
        status: 'analyzing',
        currentIndex: nextIndex,
        currentIssue: undefined,
        candidates: undefined,
        canonicalIssue: undefined,
        message: `Analyzing issue #${state.issues[nextIndex].number}...`,
      }));
      void processIssue(state.issues[nextIndex]);
    } else {
      // No delay, exit immediately.
      onExit();
    }
  }, [state.currentIndex, state.issues, processIssue, onExit]);

  const performAction = async (action: 'duplicate' | 'remove-label') => {
    if (!state.currentIssue) return;

    setState((s) => ({
      ...s,
      status: 'analyzing',
      message: `Performing action: ${action}...`,
    }));

    try {
      if (action === 'duplicate' && state.canonicalIssue) {
        const comment =
          state.suggestedComment ||
          `Duplicate of #${state.canonicalIssue.number}. ${state.canonicalIssue.reason || ''}`;

        // 1. Add comment
        await spawnAsync('gh', [
          'issue',
          'comment',
          String(state.currentIssue.number),
          '--body',
          comment,
        ]);

        // 2. Remove the triage label
        await spawnAsync('gh', [
          'issue',
          'edit',
          String(state.currentIssue.number),
          '--remove-label',
          'status/possible-duplicate',
        ]);

        // 3. Close as duplicate using API (gh issue close doesn't support 'duplicate' reason via CLI flags yet)
        await spawnAsync('gh', [
          'api',
          '-X',
          'PATCH',
          `repos/google-gemini/gemini-cli/issues/${state.currentIssue.number}`,
          '-f',
          'state=closed',
          '-f',
          'state_reason=duplicate',
        ]);
      } else if (action === 'remove-label') {
        await spawnAsync('gh', [
          'issue',
          'edit',
          String(state.currentIssue.number),
          '--remove-label',
          'status/possible-duplicate',
        ]);
      }
      handleNext();
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        message: `Action failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  useKeypress(
    (key) => {
      const input = key.sequence;

      // Global Quit/Cancel
      if (
        keyMatchers[Command.ESCAPE](key) ||
        (input === 'q' && focusSection !== 'candidate_detail')
      ) {
        if (focusSection === 'candidate_detail') {
          setFocusSection('candidates');
          return;
        }
        onExit();
        return;
      }

      if (state.status !== 'interaction') return;

      // Priority 1: Action Confirmation (Enter)
      // If an action is pending (inputAction is set), Enter ALWAYS confirms it
      if (keyMatchers[Command.RETURN](key) && inputAction) {
        if (inputAction === 's') {
          handleNext();
        } else if (inputAction === 'd' && state.canonicalIssue) {
          void performAction('duplicate');
        } else if (inputAction === 'r') {
          void performAction('remove-label');
        }
        setInputAction('');
        return;
      }

      // Priority 2: Action Selection (s, d, r)
      if (focusSection !== 'candidate_detail') {
        if (
          input === 's' ||
          (input === 'd' && state.canonicalIssue) ||
          input === 'r'
        ) {
          setInputAction(input);
          return;
        }
      }

      // Priority 3: Navigation
      if (key.name === 'tab') {
        setFocusSection((prev) =>
          prev === 'target' ? 'candidates' : 'target',
        );
        setInputAction(''); // Clear pending action when switching focus
        return;
      }

      if (focusSection === 'target') {
        if (input === 'e') {
          setTargetExpanded((prev) => !prev);
          // Reset scroll on expand toggle to avoid confusion
          setTargetScrollOffset(0);
        }
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          const targetBody = state.currentIssue?.body || '';
          const targetLines = targetBody.split('\n');
          const visibleLines = targetExpanded
            ? VISIBLE_LINES_EXPANDED
            : VISIBLE_LINES_COLLAPSED;
          const maxScroll = Math.max(0, targetLines.length - visibleLines);
          setTargetScrollOffset((prev) => Math.min(prev + 1, maxScroll));
        }
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          setTargetScrollOffset((prev) => Math.max(0, prev - 1));
        }
      } else if (focusSection === 'candidates') {
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          setSelectedCandidateIndex((prev) =>
            Math.min((state.candidates?.length || 1) - 1, prev + 1),
          );
        }
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          setSelectedCandidateIndex((prev) => Math.max(0, prev - 1));
        }
        // Enter on candidates only goes to detail if NO action is selected
        if (
          keyMatchers[Command.MOVE_RIGHT](key) ||
          (keyMatchers[Command.RETURN](key) && !inputAction)
        ) {
          setFocusSection('candidate_detail');
          setCandidateScrollOffset(0);
        }
      } else if (focusSection === 'candidate_detail') {
        const selectedCandidate = state.candidates?.[selectedCandidateIndex];
        const candBody = selectedCandidate?.body || '';
        const candLines = candBody.split('\n');
        const maxScroll = Math.max(0, candLines.length - VISIBLE_LINES_DETAIL);

        if (keyMatchers[Command.MOVE_LEFT](key)) {
          setFocusSection('candidates');
        }
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          setCandidateScrollOffset((prev) => Math.min(prev + 1, maxScroll));
        }
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          setCandidateScrollOffset((prev) => Math.max(0, prev - 1));
        }
      }
    },
    { isActive: true },
  );

  if (state.status === 'loading') {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> {state.message}</Text>
      </Box>
    );
  }

  if (state.status === 'analyzing') {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> {state.message}</Text>
      </Box>
    );
  }

  if (state.status === 'completed') {
    return <Text color="green">{state.message}</Text>;
  }

  if (state.status === 'error') {
    return <Text color="red">{state.message}</Text>;
  }

  const { currentIssue } = state;
  const targetBody = currentIssue?.body || '';
  // Visible lines for target
  const targetLines = targetBody.split('\n');
  const visibleLines = targetExpanded
    ? VISIBLE_LINES_EXPANDED
    : VISIBLE_LINES_COLLAPSED;
  const targetViewLines = targetLines.slice(
    targetScrollOffset,
    targetScrollOffset + visibleLines,
  );

  const selectedCandidate = state.candidates?.[selectedCandidateIndex];

  if (focusSection === 'candidate_detail' && selectedCandidate) {
    const candBody = selectedCandidate.body || '';
    const candLines = candBody.split('\n');
    const candViewLines = candLines.slice(
      candidateScrollOffset,
      candidateScrollOffset + VISIBLE_LINES_DETAIL,
    );

    return (
      <Box
        flexDirection="column"
        borderColor="magenta"
        borderStyle="double"
        padding={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="magenta">
            Candidate Detail: #{selectedCandidate.number}
          </Text>
          <Text color="gray">Esc to go back</Text>
        </Box>
        <Text bold>{selectedCandidate.title}</Text>
        <Text color="gray">
          Author: {selectedCandidate.author?.login} | 👍{' '}
          {getReactionCount(selectedCandidate)}
        </Text>
        <Text color="gray">{selectedCandidate.url}</Text>
        <Box
          borderStyle="single"
          marginTop={1}
          flexDirection="column"
          minHeight={Math.min(candLines.length, VISIBLE_LINES_DETAIL)}
        >
          {candViewLines.map((line: string, i: number) => (
            <Text key={i} wrap="truncate-end">
              {line}
            </Text>
          ))}
          {candLines.length > candidateScrollOffset + VISIBLE_LINES_DETAIL && (
            <Text color="gray">... (more below)</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Use Up/Down to scroll. Left Arrow or Esc to go back.
          </Text>
        </Box>
      </Box>
    );
  }

  // Calculate visible candidates list
  const visibleCandidates =
    state.candidates?.slice(
      candidateListScrollOffset,
      candidateListScrollOffset + VISIBLE_CANDIDATES,
    ) || [];

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="cyan">
          Triage Issue ({state.currentIndex + 1}/{state.totalIssues})
        </Text>
        <Text color="gray">
          [Tab] Switch Focus | [e] Expand Body | [q] Quit
        </Text>
      </Box>

      {/* Target Issue Section */}
      <Box
        flexDirection="column"
        borderStyle={focusSection === 'target' ? 'double' : 'single'}
        borderColor={focusSection === 'target' ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            Issue:{' '}
            <Text bold color="yellow">
              #{currentIssue?.number}
            </Text>{' '}
            - {currentIssue?.title}
          </Text>
          <Text color="gray">
            Author: {currentIssue?.author?.login} | 👍{' '}
            {getReactionCount(currentIssue)}
          </Text>
        </Box>
        <Text color="gray">{currentIssue?.url}</Text>
        <Box
          marginTop={1}
          flexDirection="column"
          minHeight={Math.min(targetLines.length, visibleLines)}
        >
          {targetViewLines.map((line, i) => (
            <Text key={i} italic wrap="truncate-end">
              {line}
            </Text>
          ))}
          {!targetExpanded && targetLines.length > VISIBLE_LINES_COLLAPSED && (
            <Text color="gray">... (press &apos;e&apos; to expand)</Text>
          )}
          {targetExpanded &&
            targetLines.length >
              targetScrollOffset + VISIBLE_LINES_EXPANDED && (
              <Text color="gray">... (more below)</Text>
            )}
        </Box>
      </Box>

      {/* Candidates List Section */}
      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle={focusSection === 'candidates' ? 'double' : 'single'}
        borderColor={focusSection === 'candidates' ? 'magenta' : 'gray'}
        paddingX={1}
        minHeight={VISIBLE_CANDIDATES * 2 + 1}
      >
        <Text bold color="magenta">
          Ranked Candidates (Select to view details):
        </Text>
        {state.candidates?.length === 0 ? (
          <Text italic color="gray">
            {' '}
            No candidates found.
          </Text>
        ) : (
          visibleCandidates.map((c: Candidate, i: number) => {
            const absoluteIndex = candidateListScrollOffset + i;
            return (
              <Box key={c.number} flexDirection="column" marginLeft={1}>
                <Text
                  color={
                    state.canonicalIssue?.number === c.number
                      ? 'green'
                      : 'white'
                  }
                  backgroundColor={
                    focusSection === 'candidates' &&
                    selectedCandidateIndex === absoluteIndex
                      ? 'blue'
                      : undefined
                  }
                  wrap="truncate-end"
                >
                  {absoluteIndex + 1}. <Text bold>#{c.number}</Text> - {c.title}{' '}
                  (Score: {c.score}/100)
                </Text>
                <Box marginLeft={2}>
                  <Text color="gray" wrap="truncate-end">
                    Reactions: {getReactionCount(c)} | {c.reason}
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
        {state.candidates &&
          state.candidates.length >
            candidateListScrollOffset + VISIBLE_CANDIDATES && (
            <Text color="gray">
              ... (
              {state.candidates.length -
                (candidateListScrollOffset + VISIBLE_CANDIDATES)}{' '}
              more)
            </Text>
          )}
      </Box>

      {/* Analysis / Actions Footer */}
      <Box
        marginTop={1}
        padding={1}
        borderStyle="round"
        borderColor="blue"
        flexDirection="column"
      >
        <Box flexDirection="row">
          <Text bold color="blue">
            Analysis:{' '}
          </Text>
          <Text wrap="truncate-end"> {state.message}</Text>
        </Box>
        {state.suggestedComment && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="gray">
              Suggested Comment:
            </Text>
            <Text italic color="gray" wrap="truncate-end">
              &quot;{state.suggestedComment}&quot;
            </Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column">
          <Text bold color="white">
            Actions (Focus Target/List to use):
          </Text>
          <Text>
            [d] Mark as duplicate{' '}
            {state.canonicalIssue ? `of #${state.canonicalIssue.number}` : ''}
          </Text>
          <Text>[r] Remove &apos;possible-duplicate&apos; label</Text>
          <Text>[s] Skip</Text>
        </Box>
        <Box
          borderStyle="bold"
          borderColor="yellow"
          paddingX={2}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <Text bold color="yellow">
            SELECTED: {inputAction ? inputAction.toUpperCase() : '...'}
          </Text>
          {inputAction ? (
            <Text color="gray">Press ENTER to confirm</Text>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
};
