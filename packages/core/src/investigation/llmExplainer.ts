/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/llmExplainer
 */

import type {
  ClassSummary,
  RetainerChain,
  LeakReport,
  LeakCandidate,
} from './heapSnapshotAnalyzer.js';

import type { RootCauseReport, Confidence } from './rootCauseAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Structured explanation for a retainer chain */
export interface RetainerExplanation {
  /** The retainer chain being explained */
  chain: RetainerChain;

  /** Plain English explanation of WHY this object is retained */
  whyRetained: string;

  /** What code pattern is likely causing this retention */
  likelyCause: string;

  /** Specific code changes that would fix this */
  suggestedFixes: CodeFix[];

  /** Follow-up questions the user should investigate */
  followUpQuestions: string[];

  /** Severity assessment */
  severity: 'critical' | 'warning' | 'info';

  /** Estimated memory savings if fixed */
  estimatedSavings: number;
}

/** A suggested code fix */
export interface CodeFix {
  /** What this fix does */
  description: string;

  /** The pattern to look for in code */
  findPattern: string;

  /** The suggested replacement */
  replaceWith: string;

  /** Which files to look in (based on class/function names) */
  searchHint: string;

  /** Confidence that this fix is correct */
  confidence: Confidence;
}

/** Full LLM-generated investigation summary */
export interface InvestigationNarrative {
  /** Executive summary (1-3 sentences) */
  executiveSummary: string;

  /** Detailed narrative explaining the memory situation */
  narrative: string;

  /** Priority-ordered action items */
  actionItems: ActionItem[];

  /** Suggested next investigation steps */
  nextSteps: string[];

  /** The prompt that was used to generate this (for transparency) */
  generationPrompt: string;
}

/** An action item from the investigation */
export interface ActionItem {
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  description: string;
  effort: 'trivial' | 'small' | 'medium' | 'large';
  estimatedSavings: number;
}

/** Multi-turn conversation state for interactive investigation */
export interface ConversationState {
  /** Unique session ID */
  sessionId: string;

  /** History of prompts and responses */
  turns: ConversationTurn[];

  /** Current investigation context */
  context: InvestigationContext;

  /** Suggested next questions */
  suggestedQuestions: string[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Tool calls made during this turn */
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result: string;
}

/** Context accumulated during an investigation session */
export interface InvestigationContext {
  snapshotPath?: string;
  classSummaries?: ClassSummary[];
  rootCauseReport?: RootCauseReport;
  leakReport?: LeakReport;
  retainerChains?: RetainerChain[];
  focusedClasses?: string[];
  hypotheses?: string[];
}

// ─── Prompt Templates ────────────────────────────────────────────────────────

/**
 * Prompt templates for different investigation scenarios.
 * These are carefully crafted to produce structured, actionable output from Gemini.
 */
const PROMPTS = {
  /**
   * Explain a retainer chain in plain English.
   */
  explainRetainerChain: (chain: RetainerChain, context?: string): string => `
You are a Node.js memory debugging expert. Explain this V8 heap retainer chain to a developer who is investigating a memory leak.

## Retainer Chain
Object: ${chain.nodeName} (type: ${chain.nodeType}, id: ${chain.nodeId})
Self size: ${chain.selfSize} bytes
Retained size: ${chain.retainedSize} bytes

Path from GC root:
${chain.chain.map((step, i) => `  ${i}. ${step.edgeName} (${step.edgeType}) → ${step.nodeName} (${step.nodeType})`).join('\n')}

${context ? `## Additional Context\n${context}\n` : ''}

## Instructions
Provide a JSON response with this structure:
{
  "whyRetained": "Plain English explanation of why this object cannot be garbage collected",
  "likelyCause": "The code pattern that's likely causing this (e.g., 'Event listener registered in a loop without cleanup')",
  "suggestedFixes": [
    {
      "description": "What this fix does",
      "findPattern": "Code pattern to search for (regex-friendly)",
      "replaceWith": "Suggested replacement code",
      "searchHint": "Which files/modules to look in",
      "confidence": "high|medium|low"
    }
  ],
  "followUpQuestions": ["Questions to investigate further"],
  "severity": "critical|warning|info"
}
`,

  /**
   * Generate an investigation narrative from root cause analysis results.
   */
  generateNarrative: (
    report: RootCauseReport,
    classSummaries: ClassSummary[],
  ): string => {
    const topClasses = classSummaries.slice(0, 15);
    const highFindings = report.findings.filter((f) => f.confidence === 'high');
    const medFindings = report.findings.filter(
      (f) => f.confidence === 'medium',
    );

    return `
You are a senior Node.js performance engineer writing a memory investigation report for a team.

## Heap Analysis Results
Health Score: ${report.healthScore}/100
Total Estimated Impact: ${report.totalEstimatedImpact} bytes
Findings: ${report.findings.length} total (${highFindings.length} high, ${medFindings.length} medium confidence)

### High-Confidence Findings
${highFindings.map((f) => `- **${f.title}** (${f.category}): ${f.description.slice(0, 200)}`).join('\n')}

### Top Classes by Retained Size
${topClasses.map((c) => `- ${c.className}: ${c.count} instances, ${c.retainedSize} bytes retained`).join('\n')}

### All Recommendations
${report.recommendations.map((r) => `- ${r}`).join('\n')}

## Instructions
Write a clear, actionable investigation summary in JSON format:
{
  "executiveSummary": "1-3 sentence summary for busy engineers",
  "narrative": "Detailed 2-3 paragraph narrative explaining what's happening with the memory",
  "actionItems": [
    {
      "priority": "P0|P1|P2",
      "title": "Short action title",
      "description": "What to do and why",
      "effort": "trivial|small|medium|large",
      "estimatedSavings": <bytes>
    }
  ],
  "nextSteps": ["Suggested follow-up investigation steps"]
}
`;
  },

  /**
   * Generate a multi-turn investigation question based on current context.
   */
  suggestNextQuestion: (context: InvestigationContext): string => {
    const parts: string[] = [
      'You are an expert memory debugger guiding a developer through an investigation.',
    ];

    if (context.rootCauseReport) {
      parts.push(`\nCurrent findings: ${context.rootCauseReport.summary}`);
      parts.push(`Health score: ${context.rootCauseReport.healthScore}/100`);
    }

    if (context.focusedClasses && context.focusedClasses.length > 0) {
      parts.push(
        `\nCurrently investigating: ${context.focusedClasses.join(', ')}`,
      );
    }

    if (context.hypotheses && context.hypotheses.length > 0) {
      parts.push(`\nWorking hypotheses: ${context.hypotheses.join('; ')}`);
    }

    parts.push(`
Based on the investigation so far, suggest 3-5 follow-up questions or actions that would help narrow down the root cause. Return as JSON:
{
  "questions": [
    {
      "question": "The question to ask or investigate",
      "rationale": "Why this would help",
      "toolAction": "The investigation tool action to run (if applicable)",
      "toolParams": {}
    }
  ]
}
`);

    return parts.join('\n');
  },

  /**
   * Explain a leak candidate from the 3-snapshot technique.
   */
  explainLeakCandidate: (candidate: LeakCandidate): string => `
You are debugging a memory leak detected by the 3-snapshot technique.

## Leak Candidate
Class: ${candidate.className}
Growth: ${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3} instances
Growth rate: ${candidate.growthRate} new instances per interval
Total leaked memory: ${candidate.totalLeakedSize} bytes
Confidence: ${candidate.confidence}

${
  candidate.retainerChains.length > 0
    ? `## Retainer Chains
${candidate.retainerChains
  .map(
    (chain, i) =>
      `Chain ${i + 1}: ${chain.chain.map((s) => `${s.edgeName}→${s.nodeName}`).join(' → ')}`,
  )
  .join('\n')}`
    : 'No retainer chains available.'
}

## Instructions
Explain this leak in plain English and suggest fixes. Return JSON:
{
  "explanation": "What's happening and why it's a leak",
  "rootCause": "The most likely root cause",
  "codePattern": "The problematic code pattern (pseudocode)",
  "fix": "The specific fix (pseudocode)",
  "confidence": "high|medium|low",
  "relatedPatterns": ["Other common patterns that cause similar leaks"]
}
`,
};

// ─── LLM Explainer ──────────────────────────────────────────────────────────

/**
 * LLM-powered explanation engine for memory investigation results.
 *
 * This class generates structured prompts for the Gemini model and parses
 * responses into actionable investigation data. It does NOT directly call
 * the Gemini API — instead, it provides prompt/parse pairs that the
 * investigation tool orchestrator uses with the existing Gemini infrastructure.
 *
 * Design rationale: By separating prompt generation from API calls, this module
 * can be tested without an API key and can work with any LLM backend.
 */
export class LLMExplainer {
  private conversationState: ConversationState | null = null;

  /**
   * Generate a prompt to explain a retainer chain.
   * Returns the prompt string — caller sends to Gemini and passes response to parseRetainerExplanation().
   */
  generateRetainerExplanationPrompt(
    chain: RetainerChain,
    additionalContext?: string,
  ): string {
    return PROMPTS.explainRetainerChain(chain, additionalContext);
  }

  /**
   * Parse Gemini's response to a retainer chain explanation prompt.
   */
  parseRetainerExplanation(
    chain: RetainerChain,
    llmResponse: string,
  ): RetainerExplanation {
    try {
      // Try to parse as JSON first
      const parsed = extractJSON(llmResponse);

      const suggestedFixesArray: unknown[] = Array.isArray(
        parsed['suggestedFixes'],
      )
        ? (parsed['suggestedFixes'] as unknown[])
        : [];
      const followUpArray: unknown[] = Array.isArray(
        parsed['followUpQuestions'],
      )
        ? (parsed['followUpQuestions'] as unknown[])
        : [];

      return {
        chain,
        whyRetained: String(
          parsed['whyRetained'] || 'Unable to determine retention reason.',
        ),
        likelyCause: String(parsed['likelyCause'] || 'Unknown code pattern.'),
        suggestedFixes: suggestedFixesArray.map((fix: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const fixRec = fix as Record<string, unknown>;
          return {
            description: String(fixRec['description'] || ''),
            findPattern: String(fixRec['findPattern'] || ''),
            replaceWith: String(fixRec['replaceWith'] || ''),
            searchHint: String(fixRec['searchHint'] || ''),
            confidence: validateConfidence(fixRec['confidence']),
          };
        }),
        followUpQuestions: followUpArray.map((q) => String(q)),
        severity: validateSeverity(parsed['severity']),
        estimatedSavings: chain.retainedSize,
      };
    } catch {
      // Fallback: use the raw response as the explanation
      return {
        chain,
        whyRetained: llmResponse.slice(0, 500),
        likelyCause: 'See full explanation above.',
        suggestedFixes: [],
        followUpQuestions: [],
        severity: 'info',
        estimatedSavings: chain.retainedSize,
      };
    }
  }

  /**
   * Generate a prompt for a full investigation narrative.
   */
  generateNarrativePrompt(
    report: RootCauseReport,
    classSummaries: ClassSummary[],
  ): string {
    return PROMPTS.generateNarrative(report, classSummaries);
  }

  /**
   * Parse Gemini's response to a narrative prompt.
   */
  parseNarrative(llmResponse: string, prompt: string): InvestigationNarrative {
    try {
      const parsed = extractJSON(llmResponse);

      const actionItemsArray: unknown[] = Array.isArray(parsed['actionItems'])
        ? (parsed['actionItems'] as unknown[])
        : [];
      const nextStepsArray: unknown[] = Array.isArray(parsed['nextSteps'])
        ? (parsed['nextSteps'] as unknown[])
        : [];

      return {
        executiveSummary: String(
          parsed['executiveSummary'] || 'Investigation complete.',
        ),
        narrative: String(parsed['narrative'] || llmResponse),
        actionItems: actionItemsArray.map((item: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const itemRec = item as Record<string, unknown>;
          return {
            priority: validatePriority(itemRec['priority']),
            title: String(itemRec['title'] || ''),
            description: String(itemRec['description'] || ''),
            effort: validateEffort(itemRec['effort']),
            estimatedSavings: Number(itemRec['estimatedSavings']) || 0,
          };
        }),
        nextSteps: nextStepsArray.map((step) => String(step)),
        generationPrompt: prompt,
      };
    } catch {
      return {
        executiveSummary: 'Investigation results generated.',
        narrative: llmResponse,
        actionItems: [],
        nextSteps: [],
        generationPrompt: prompt,
      };
    }
  }

  /**
   * Generate a prompt to explain a leak candidate.
   */
  generateLeakExplanationPrompt(candidate: LeakCandidate): string {
    return PROMPTS.explainLeakCandidate(candidate);
  }

  /**
   * Generate prompts for suggested follow-up investigation questions.
   */
  generateFollowUpPrompt(context: InvestigationContext): string {
    return PROMPTS.suggestNextQuestion(context);
  }

  // ─── Conversation Management ───────────────────────────────────────────

  /**
   * Start a new multi-turn investigation conversation.
   */
  startConversation(initialContext: InvestigationContext): ConversationState {
    this.conversationState = {
      sessionId: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      turns: [],
      context: initialContext,
      suggestedQuestions: this.generateInitialQuestions(initialContext),
    };
    return this.conversationState;
  }

  /**
   * Add a turn to the conversation.
   */
  addTurn(
    role: 'user' | 'assistant',
    content: string,
    toolCalls?: ToolCallRecord[],
  ): void {
    if (!this.conversationState) {
      throw new Error(
        'No active conversation. Call startConversation() first.',
      );
    }

    this.conversationState.turns.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      toolCalls,
    });
  }

  /**
   * Get the current conversation state.
   */
  getConversation(): ConversationState | null {
    return this.conversationState;
  }

  /**
   * Generate a context-aware investigation prompt that includes conversation history.
   */
  generateContextualPrompt(userMessage: string): string {
    if (!this.conversationState) {
      return userMessage;
    }

    const history = this.conversationState.turns
      .slice(-6) // Last 6 turns for context
      .map(
        (t) =>
          `${t.role === 'user' ? 'Developer' : 'Investigator'}: ${t.content}`,
      )
      .join('\n\n');

    const contextSummary = this.summarizeContext(
      this.conversationState.context,
    );

    return `
You are an expert memory debugging assistant conducting an interactive investigation.

## Investigation Context
${contextSummary}

## Conversation History
${history}

## Developer's Question
${userMessage}

## Instructions
Respond helpfully, referencing the investigation data when relevant. If the developer's question requires running a tool, specify which investigation action to take. Always ground your answers in the actual heap data — don't speculate without evidence.

Respond in JSON format:
{
  "response": "Your response to the developer",
  "suggestedActions": [
    {
      "action": "investigate tool action name",
      "params": {},
      "reason": "Why this would help"
    }
  ],
  "updatedHypotheses": ["Current working hypotheses based on the conversation"],
  "suggestedQuestions": ["3-5 follow-up questions"]
}
`;
  }

  // ─── Local Analysis (No LLM Required) ──────────────────────────────────

  /**
   * Generate a retainer chain explanation using local heuristics (no LLM call needed).
   * This provides instant explanations for common patterns without API latency.
   */
  explainRetainerChainLocally(chain: RetainerChain): RetainerExplanation {
    const steps = chain.chain ?? [];
    const edgeNames = steps.map((s) => String(s.edgeName).toLowerCase());
    const nodeNames = steps.map((s) => s.nodeName.toLowerCase());
    const nodeTypes = steps.map((s) => s.nodeType);

    // Detect common patterns
    let whyRetained = '';
    let likelyCause = '';
    const fixes: CodeFix[] = [];
    let severity: 'critical' | 'warning' | 'info' = 'info';

    // Pattern: Event listener chain
    if (edgeNames.some((e) => /listener|handler|_events|on[A-Z]/.test(e))) {
      whyRetained =
        `This ${chain.nodeType} "${chain.nodeName}" is being kept alive by an event listener chain. ` +
        `An event handler or callback holds a reference to this object, preventing garbage collection.`;
      likelyCause =
        'Event listener registered without a corresponding removal (missing .off(), removeEventListener(), or AbortController).';
      severity = chain.retainedSize > 1_000_000 ? 'critical' : 'warning';
      fixes.push({
        description: 'Add cleanup for the event listener',
        findPattern: `\\.on\\(.*${chain.nodeName}|addEventListener.*${chain.nodeName}`,
        replaceWith:
          'Add a corresponding .off() or removeEventListener() in your cleanup/dispose method',
        searchHint: `Look in files that create ${chain.nodeName} instances`,
        confidence: 'medium',
      });
    }
    // Pattern: Cache/Map retention
    else if (
      edgeNames.some((e) => /cache|store|map|registry|pool/i.test(e)) ||
      nodeNames.some((n) => /map|set|cache|store|registry/i.test(n))
    ) {
      whyRetained =
        `This ${chain.nodeType} "${chain.nodeName}" is stored in a cache or collection. ` +
        `It will remain in memory as long as the cache/collection holds a reference to it.`;
      likelyCause =
        'Object stored in a cache/Map/Set without an eviction policy (no TTL, no max size limit).';
      severity = chain.retainedSize >= 5_000_000 ? 'critical' : 'warning';
      fixes.push({
        description: 'Add cache eviction policy',
        findPattern: `new Map\\(|new Set\\(|cache\\[|cache\\.set`,
        replaceWith:
          'Use an LRU cache (e.g., lru-cache package) with maxSize and TTL',
        searchHint: 'Look in caching/storage modules',
        confidence: 'high',
      });
    }
    // Pattern: Timer retention (check before closure — timer closures are a specific sub-pattern)
    else if (
      edgeNames.some((e) => /timer|interval|timeout|_timer/i.test(e)) ||
      nodeNames.some((n) => /timeout|interval|timer/i.test(n))
    ) {
      whyRetained =
        `This object is retained by a timer (setInterval/setTimeout). ` +
        `The timer's callback closure keeps a reference to this object until the timer is cleared.`;
      likelyCause =
        'A setInterval() or setTimeout() was created without a corresponding clearInterval()/clearTimeout().';
      severity = 'warning';
      fixes.push({
        description: 'Clear the timer when no longer needed',
        findPattern: `setInterval|setTimeout`,
        replaceWith:
          'Store the timer ID and call clearInterval(id)/clearTimeout(id) in cleanup',
        searchHint: 'Look for timer setup code without corresponding cleanup',
        confidence: 'high',
      });
    }
    // Pattern: Closure capture
    else if (nodeTypes.includes('closure')) {
      whyRetained =
        `This object is captured by a closure (an inner function that references variables from its outer scope). ` +
        `The closure keeps everything it references alive, even if only part of the captured data is needed.`;
      likelyCause =
        'A closure captures a reference to a large object or data structure that outlives its usefulness.';
      severity = chain.retainedSize > 2_000_000 ? 'critical' : 'warning';
      fixes.push({
        description: 'Extract only the needed values from the closure scope',
        findPattern: 'function|=>|callback|handler',
        replaceWith:
          'Destructure or copy only the needed values before the closure, set the rest to null',
        searchHint: `Look for closures that reference ${chain.nodeName}`,
        confidence: 'medium',
      });
    }
    // Pattern: Global/root retention
    else if (steps.length <= 2 && steps[0]?.nodeType === 'synthetic') {
      whyRetained =
        `This object is directly or nearly-directly reachable from a GC root (global scope). ` +
        `It's likely stored in a global variable, module-level variable, or static field.`;
      likelyCause =
        "Object stored in module scope or global variable — it will never be GC'd unless explicitly nullified.";
      severity = chain.retainedSize > 10_000_000 ? 'critical' : 'info';
      fixes.push({
        description:
          'Move from module scope to function scope or use lazy initialization',
        findPattern: `(const|let|var)\\s+\\w+.*=.*${chain.nodeName}`,
        replaceWith:
          'Move the declaration inside a function, or set to null when no longer needed',
        searchHint: 'Look at top-level module declarations',
        confidence: 'low',
      });
    }
    // Generic explanation
    else {
      whyRetained =
        `This ${chain.nodeType} "${chain.nodeName}" is retained through a reference chain ` +
        `of ${steps.length} steps from a GC root. Each link in this chain prevents garbage collection.`;
      likelyCause =
        'An object reference chain is preventing garbage collection.';
      severity = chain.retainedSize > 5_000_000 ? 'warning' : 'info';
    }

    const followUpQuestions = [
      `How many instances of ${chain.nodeName} exist in the heap?`,
      `What is the allocation site for ${chain.nodeName}?`,
      `Are there other retainer paths to this object?`,
    ];

    if (chain.retainedSize > 1_000_000) {
      followUpQuestions.push(
        `What objects does ${chain.nodeName} itself retain?`,
      );
    }

    return {
      chain,
      whyRetained,
      likelyCause,
      suggestedFixes: fixes,
      followUpQuestions,
      severity,
      estimatedSavings: chain.retainedSize,
    };
  }

  /**
   * Generate a full investigation narrative using local heuristics (no LLM required).
   * This produces an instant narrative without API calls — useful for offline mode
   * and as a baseline that can be enhanced by LLM.
   */
  generateLocalNarrative(
    report: RootCauseReport,
    classSummaries: ClassSummary[],
  ): InvestigationNarrative {
    const highFindings = report.findings.filter((f) => f.confidence === 'high');
    const medFindings = report.findings.filter(
      (f) => f.confidence === 'medium',
    );
    const totalSize = classSummaries.reduce(
      (sum, c) => sum + c.retainedSize,
      0,
    );

    // Executive summary
    let executiveSummary: string;
    if (report.healthScore >= 80) {
      executiveSummary =
        `Memory health is good (${report.healthScore}/100). ` +
        (report.findings.length > 0
          ? `${report.findings.length} minor issue${report.findings.length > 1 ? 's' : ''} detected.`
          : 'No significant issues detected.');
    } else if (report.healthScore >= 50) {
      executiveSummary =
        `Memory health is moderate (${report.healthScore}/100) with ${highFindings.length} high-priority issue${highFindings.length !== 1 ? 's' : ''}. ` +
        `Estimated ${formatBytes(report.totalEstimatedImpact)} of memory could be reclaimed.`;
    } else {
      executiveSummary =
        `Memory health is poor (${report.healthScore}/100). ` +
        `${highFindings.length} critical issue${highFindings.length !== 1 ? 's' : ''} found, ` +
        `with an estimated impact of ${formatBytes(report.totalEstimatedImpact)}.`;
    }

    // Narrative
    const narrativeParts: string[] = [];

    narrativeParts.push(
      `The heap contains ${classSummaries.length} distinct classes using a total of ${formatBytes(totalSize)}. ` +
        `The top memory consumers are ${classSummaries
          .slice(0, 3)
          .map((c) => `${c.className} (${formatBytes(c.retainedSize)})`)
          .join(', ')}.`,
    );

    if (highFindings.length > 0) {
      narrativeParts.push(
        `\n\nThe most critical issues are: ` +
          highFindings.map((f) => f.title).join('; ') +
          '. ' +
          `These should be addressed first as they account for the majority of the memory impact.`,
      );
    }

    if (medFindings.length > 0) {
      narrativeParts.push(
        `\n\nAdditionally, ${medFindings.length} medium-confidence finding${medFindings.length > 1 ? 's were' : ' was'} identified: ` +
          medFindings.map((f) => f.title).join('; ') +
          '.',
      );
    }

    // Action items
    const actionItems: ActionItem[] = [];

    for (const finding of report.findings) {
      const priority =
        finding.confidence === 'high'
          ? 'P0'
          : finding.confidence === 'medium'
            ? 'P1'
            : 'P2';
      const effort =
        (finding.estimatedImpact ?? 0) > 10_000_000 ? 'medium' : 'small';

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const pri = priority as unknown as 'P0' | 'P1' | 'P2';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const eff = effort as unknown as 'trivial' | 'small' | 'medium' | 'large';
      actionItems.push({
        priority: pri,
        title: finding.title,
        description:
          finding.recommendations[0] || finding.description.slice(0, 200),
        effort: eff,
        estimatedSavings: finding.estimatedImpact ?? 0,
      });
    }

    // Sort by priority
    actionItems.sort((a, b) => a.priority.localeCompare(b.priority));

    // Next steps
    const nextSteps = [
      'Take a second heap snapshot after 1-2 minutes to check for growing allocations',
      'Use the 3-snapshot technique to confirm which objects are actually leaking',
    ];

    if (highFindings.some((f) => f.category === 'event_listener_leak')) {
      nextSteps.push(
        'Run the process with --trace-events-enabled to trace event listener registrations',
      );
    }
    if (highFindings.some((f) => f.category === 'unbounded_collection')) {
      nextSteps.push(
        'Add memory monitoring (process.memoryUsage()) to track cache size over time',
      );
    }

    return {
      executiveSummary,
      narrative: narrativeParts.join(''),
      actionItems,
      nextSteps,
      generationPrompt: '(generated locally without LLM)',
    };
  }

  // ─── Terminal Formatting ───────────────────────────────────────────────

  /**
   * Format a retainer explanation for terminal display with ANSI colors.
   */
  static formatForTerminal(explanation: RetainerExplanation): string {
    const lines: string[] = [];

    const severityColor = {
      critical: '\x1b[31m', // red
      warning: '\x1b[33m', // yellow
      info: '\x1b[36m', // cyan
    };
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';

    lines.push(
      `${bold}${severityColor[explanation.severity]}━━━ ${explanation.severity.toUpperCase()}: ${explanation.chain.nodeName} ━━━${reset}`,
    );
    lines.push('');
    lines.push(`${bold}Why retained:${reset} ${explanation.whyRetained}`);
    lines.push('');
    lines.push(`${bold}Likely cause:${reset} ${explanation.likelyCause}`);
    lines.push('');
    lines.push(
      `${bold}Estimated savings:${reset} ${formatBytes(explanation.estimatedSavings)}`,
    );
    lines.push('');

    // Retainer chain visualization
    lines.push(`${bold}Retainer chain:${reset}`);
    for (let i = 0; i < explanation.chain.chain.length; i++) {
      const step = explanation.chain.chain[i];
      const prefix = i === explanation.chain.chain.length - 1 ? '  └─' : '  ├─';
      lines.push(
        `${dim}${prefix}${reset} ${step.edgeName} ${dim}(${step.edgeType})${reset} → ${bold}${step.nodeName}${reset} ${dim}(${step.nodeType})${reset}`,
      );
    }
    lines.push('');

    // Suggested fixes
    if (explanation.suggestedFixes.length > 0) {
      lines.push(`${bold}Suggested fixes:${reset}`);
      for (const fix of explanation.suggestedFixes) {
        lines.push(
          `  ${severityColor[explanation.severity]}▸${reset} ${fix.description}`,
        );
        lines.push(`    ${dim}Search: ${fix.findPattern}${reset}`);
        lines.push(`    ${dim}Fix: ${fix.replaceWith}${reset}`);
        lines.push('');
      }
    }

    // Follow-up questions
    if (explanation.followUpQuestions.length > 0) {
      lines.push(`${bold}Investigate further:${reset}`);
      for (const q of explanation.followUpQuestions) {
        lines.push(`  ${dim}?${reset} ${q}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format an investigation narrative for terminal display.
   */
  static formatNarrativeForTerminal(narrative: InvestigationNarrative): string {
    const lines: string[] = [];
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const red = '\x1b[31m';
    const yellow = '\x1b[33m';
    const green = '\x1b[32m';

    lines.push(
      `${bold}╔══════════════════════════════════════════════════════════════════╗${reset}`,
    );
    lines.push(
      `${bold}║  MEMORY INVESTIGATION REPORT                                   ║${reset}`,
    );
    lines.push(
      `${bold}╚══════════════════════════════════════════════════════════════════╝${reset}`,
    );
    lines.push('');
    lines.push(`${bold}Summary:${reset} ${narrative.executiveSummary}`);
    lines.push('');
    lines.push(narrative.narrative);
    lines.push('');

    if (narrative.actionItems.length > 0) {
      lines.push(`${bold}━━━ Action Items ━━━${reset}`);
      lines.push('');
      for (const item of narrative.actionItems) {
        const color =
          item.priority === 'P0'
            ? red
            : item.priority === 'P1'
              ? yellow
              : green;
        lines.push(
          `  ${color}[${item.priority}]${reset} ${bold}${item.title}${reset}`,
        );
        lines.push(`       ${item.description}`);
        lines.push(
          `       ${dim}Effort: ${item.effort} | Savings: ${formatBytes(item.estimatedSavings)}${reset}`,
        );
        lines.push('');
      }
    }

    if (narrative.nextSteps.length > 0) {
      lines.push(`${bold}━━━ Next Steps ━━━${reset}`);
      lines.push('');
      for (const step of narrative.nextSteps) {
        lines.push(`  → ${step}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private generateInitialQuestions(context: InvestigationContext): string[] {
    const questions: string[] = [];

    if (!context.classSummaries) {
      questions.push('Load a heap snapshot to begin investigation');
    } else {
      questions.push('What are the top memory consumers?');
      questions.push('Are there any obvious memory leaks?');
      questions.push('Show me the retainer chain for the largest object');
    }

    if (!context.leakReport) {
      questions.push('Take 3 heap snapshots to detect leaks');
    }

    questions.push('Generate a full investigation report');

    return questions;
  }

  private summarizeContext(context: InvestigationContext): string {
    const parts: string[] = [];

    if (context.snapshotPath) {
      parts.push(`Snapshot: ${context.snapshotPath}`);
    }

    if (context.classSummaries) {
      const totalSize = context.classSummaries.reduce(
        (sum, c) => sum + c.retainedSize,
        0,
      );
      parts.push(
        `Classes: ${context.classSummaries.length}, Total: ${formatBytes(totalSize)}`,
      );
    }

    if (context.rootCauseReport) {
      parts.push(
        `Health: ${context.rootCauseReport.healthScore}/100, Findings: ${context.rootCauseReport.findings.length}`,
      );
    }

    if (context.focusedClasses && context.focusedClasses.length > 0) {
      parts.push(`Focus: ${context.focusedClasses.join(', ')}`);
    }

    return parts.join('\n');
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/** Extract JSON from an LLM response that might include markdown code fences */
function extractJSON(text: string): Record<string, unknown> {
  // Try direct parse first
  try {
    const parsed: unknown = JSON.parse(text);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return parsed as Record<string, unknown>;
  } catch {
    // Try extracting from code fences
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      const parsed: unknown = JSON.parse(match[1]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return parsed as Record<string, unknown>;
    }
    // Try finding JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return parsed as Record<string, unknown>;
    }
    throw new Error('No valid JSON found in response');
  }
}

function validateConfidence(value: unknown): Confidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

function validateSeverity(value: unknown): 'critical' | 'warning' | 'info' {
  if (value === 'critical' || value === 'warning' || value === 'info')
    return value;
  return 'info';
}

function validatePriority(value: unknown): 'P0' | 'P1' | 'P2' {
  if (value === 'P0' || value === 'P1' || value === 'P2') return value;
  return 'P2';
}

function validateEffort(
  value: unknown,
): 'trivial' | 'small' | 'medium' | 'large' {
  if (
    value === 'trivial' ||
    value === 'small' ||
    value === 'medium' ||
    value === 'large'
  )
    return value;
  return 'medium';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  // BUG FIX #15: Clamp index and handle negative bytes properly
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    units.length - 1,
  );
  const value = abs / Math.pow(1024, i);
  return `${sign}${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
