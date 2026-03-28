import { describe, it, expect, beforeEach } from 'vitest';
import {
  LLMExplainer,
  type RetainerExplanation,
  type InvestigationNarrative,
  type ConversationState,
} from './llmExplainer.js';
import type { RetainerChain, ClassSummary } from './heapSnapshotAnalyzer.js';
import type { RootCauseReport } from './rootCauseAnalyzer.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function createRetainerChain(overrides?: Partial<RetainerChain>): RetainerChain {
  return {
    nodeId: 42,
    nodeName: 'UserSession',
    nodeType: 'object',
    selfSize: 1024,
    retainedSize: 5_000_000,
    chain: [
      { edgeName: '_cache', edgeType: 'property', nodeName: 'Map', nodeType: 'object', nodeId: 10 },
      { edgeName: 'entries', edgeType: 'internal', nodeName: 'Array', nodeType: 'array', nodeId: 20 },
      { edgeName: '0', edgeType: 'element', nodeName: 'UserSession', nodeType: 'object', nodeId: 42 },
    ],
    ...overrides,
  };
}

function createEventListenerChain(): RetainerChain {
  return {
    nodeId: 99,
    nodeName: 'Closure',
    nodeType: 'closure',
    selfSize: 48,
    retainedSize: 2_000_000,
    chain: [
      { edgeName: '_listeners', edgeType: 'property', nodeName: 'EventEmitter', nodeType: 'object', nodeId: 1 },
      { edgeName: 'data', edgeType: 'property', nodeName: 'Array', nodeType: 'array', nodeId: 2 },
      { edgeName: '0', edgeType: 'element', nodeName: 'Closure', nodeType: 'closure', nodeId: 99 },
    ],
  };
}

function createTimerChain(): RetainerChain {
  return {
    nodeId: 55,
    nodeName: 'Timeout',
    nodeType: 'object',
    selfSize: 96,
    retainedSize: 500_000,
    chain: [
      { edgeName: '_timer', edgeType: 'property', nodeName: 'Timeout', nodeType: 'object', nodeId: 55 },
      { edgeName: 'callback', edgeType: 'property', nodeName: 'Closure', nodeType: 'closure', nodeId: 56 },
    ],
  };
}

function createRootCauseReport(): RootCauseReport {
  return {
    timestamp: new Date().toISOString(),
    summary: 'Found 3 potential issues: 2 high, 1 medium confidence.',
    findings: [
      {
        category: 'unbounded_collection',
        title: 'Large Map retaining 50 MB',
        description: 'Found 5 Map instances with high retained size.',
        confidence: 'high',
        evidence: ['5 Map instances', 'Total retained: 50 MB'],
        recommendations: ['Add LRU eviction to caches'],
        involvedClasses: ['Map'],
        estimatedImpact: 50_000_000,
      },
      {
        category: 'event_listener_leak',
        title: '500 listener instances',
        description: 'Found 500 listener instances.',
        confidence: 'high',
        evidence: ['500 instances'],
        recommendations: ['Audit listener cleanup'],
        involvedClasses: ['EventListener'],
        estimatedImpact: 10_000_000,
      },
      {
        category: 'string_accumulation',
        title: 'Strings consuming 20 MB',
        description: 'String accumulation detected.',
        confidence: 'medium',
        evidence: ['20 MB of strings'],
        recommendations: ['Use streaming logs'],
        involvedClasses: ['string'],
        estimatedImpact: 20_000_000,
      },
    ],
    recommendations: ['Add LRU eviction to caches', 'Audit listener cleanup', 'Use streaming logs'],
    healthScore: 40,
    totalEstimatedImpact: 80_000_000,
  };
}

function createClassSummaries(): ClassSummary[] {
  return [
    { className: 'Map', count: 5, shallowSize: 500, retainedSize: 50_000_000, instances: [1, 2, 3, 4, 5] },
    { className: 'string', count: 10000, shallowSize: 20_000_000, retainedSize: 20_000_000, instances: [] },
    { className: 'EventListener', count: 500, shallowSize: 24000, retainedSize: 10_000_000, instances: [] },
    { className: 'Array', count: 200, shallowSize: 100000, retainedSize: 5_000_000, instances: [] },
    { className: 'Closure', count: 800, shallowSize: 38400, retainedSize: 3_000_000, instances: [] },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LLMExplainer', () => {
  let explainer: LLMExplainer;

  beforeEach(() => {
    explainer = new LLMExplainer();
  });

  describe('generateRetainerExplanationPrompt', () => {
    it('should generate a prompt for a retainer chain', () => {
      const chain = createRetainerChain();
      const prompt = explainer.generateRetainerExplanationPrompt(chain);

      expect(prompt).toContain('UserSession');
      expect(prompt).toContain('_cache');
      expect(prompt).toContain('Map');
      expect(prompt).toContain('JSON response');
    });

    it('should include additional context when provided', () => {
      const chain = createRetainerChain();
      const prompt = explainer.generateRetainerExplanationPrompt(chain, 'This is from a web server');

      expect(prompt).toContain('This is from a web server');
      expect(prompt).toContain('Additional Context');
    });
  });

  describe('parseRetainerExplanation', () => {
    it('should parse valid JSON response', () => {
      const chain = createRetainerChain();
      const response = JSON.stringify({
        whyRetained: 'The UserSession is stored in a Map cache.',
        likelyCause: 'Unbounded cache without eviction.',
        suggestedFixes: [{
          description: 'Add LRU eviction',
          findPattern: 'new Map\\(\\)',
          replaceWith: 'new LRUCache({ max: 1000 })',
          searchHint: 'session-manager.ts',
          confidence: 'high',
        }],
        followUpQuestions: ['How many sessions are active?'],
        severity: 'critical',
      });

      const result = explainer.parseRetainerExplanation(chain, response);

      expect(result.whyRetained).toContain('Map cache');
      expect(result.suggestedFixes).toHaveLength(1);
      expect(result.suggestedFixes[0].confidence).toBe('high');
      expect(result.severity).toBe('critical');
    });

    it('should handle malformed JSON gracefully', () => {
      const chain = createRetainerChain();
      const result = explainer.parseRetainerExplanation(chain, 'Not valid JSON at all');

      expect(result.whyRetained).toBeTruthy();
      expect(result.severity).toBe('info');
      expect(result.suggestedFixes).toHaveLength(0);
    });

    it('should extract JSON from markdown code fences', () => {
      const chain = createRetainerChain();
      const response = '```json\n{"whyRetained": "Cache", "likelyCause": "No eviction", "suggestedFixes": [], "followUpQuestions": [], "severity": "warning"}\n```';

      const result = explainer.parseRetainerExplanation(chain, response);
      expect(result.whyRetained).toBe('Cache');
      expect(result.severity).toBe('warning');
    });
  });

  describe('explainRetainerChainLocally', () => {
    it('should detect event listener pattern', () => {
      const chain = createEventListenerChain();
      const explanation = explainer.explainRetainerChainLocally(chain);

      expect(explanation.whyRetained).toContain('event listener');
      expect(explanation.likelyCause).toContain('removal');
      expect(explanation.suggestedFixes.length).toBeGreaterThan(0);
      expect(explanation.severity).toBe('critical'); // 2MB retained
    });

    it('should detect cache/Map pattern', () => {
      const chain = createRetainerChain();
      const explanation = explainer.explainRetainerChainLocally(chain);

      expect(explanation.whyRetained).toContain('cache');
      expect(explanation.likelyCause).toContain('eviction');
      expect(explanation.severity).toBe('critical'); // 5MB retained
    });

    it('should detect timer pattern', () => {
      const chain = createTimerChain();
      const explanation = explainer.explainRetainerChainLocally(chain);

      expect(explanation.whyRetained).toContain('timer');
      expect(explanation.likelyCause).toContain('setInterval');
      expect(explanation.suggestedFixes.length).toBeGreaterThan(0);
    });

    it('should detect closure pattern', () => {
      const chain: RetainerChain = {
        nodeId: 70,
        nodeName: 'LargeBuffer',
        nodeType: 'native',
        selfSize: 1024,
        retainedSize: 3_000_000,
        chain: [
          { edgeName: 'scope', edgeType: 'context', nodeName: 'function', nodeType: 'closure', nodeId: 71 },
          { edgeName: 'data', edgeType: 'property', nodeName: 'LargeBuffer', nodeType: 'native', nodeId: 70 },
        ],
      };
      const explanation = explainer.explainRetainerChainLocally(chain);

      expect(explanation.whyRetained).toContain('closure');
      expect(explanation.severity).toBe('critical'); // 3MB
    });

    it('should include follow-up questions', () => {
      const chain = createRetainerChain();
      const explanation = explainer.explainRetainerChainLocally(chain);

      expect(explanation.followUpQuestions.length).toBeGreaterThan(0);
      expect(explanation.followUpQuestions.some(q => q.includes('UserSession'))).toBe(true);
    });
  });

  describe('generateLocalNarrative', () => {
    it('should generate narrative for poor health', () => {
      const report = createRootCauseReport();
      const summaries = createClassSummaries();
      const narrative = explainer.generateLocalNarrative(report, summaries);

      expect(narrative.executiveSummary).toContain('poor');
      expect(narrative.executiveSummary).toContain('40/100');
      expect(narrative.actionItems.length).toBeGreaterThan(0);
      expect(narrative.actionItems[0].priority).toBe('P0');
    });

    it('should generate narrative for good health', () => {
      const report: RootCauseReport = {
        ...createRootCauseReport(),
        healthScore: 90,
        findings: [],
      };
      const narrative = explainer.generateLocalNarrative(report, createClassSummaries());

      expect(narrative.executiveSummary).toContain('good');
    });

    it('should sort action items by priority', () => {
      const report = createRootCauseReport();
      const narrative = explainer.generateLocalNarrative(report, createClassSummaries());

      const priorities = narrative.actionItems.map(a => a.priority);
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i] >= priorities[i - 1]).toBe(true);
      }
    });

    it('should include relevant next steps based on findings', () => {
      const report = createRootCauseReport();
      const narrative = explainer.generateLocalNarrative(report, createClassSummaries());

      expect(narrative.nextSteps.length).toBeGreaterThan(0);
    });
  });

  describe('formatForTerminal', () => {
    it('should format explanation with ANSI codes', () => {
      const chain = createRetainerChain();
      const explanation = explainer.explainRetainerChainLocally(chain);
      const formatted = LLMExplainer.formatForTerminal(explanation);

      expect(formatted).toContain('UserSession');
      expect(formatted).toContain('Why retained');
      expect(formatted).toContain('\x1b['); // ANSI codes
    });
  });

  describe('formatNarrativeForTerminal', () => {
    it('should format narrative with headers and colors', () => {
      const report = createRootCauseReport();
      const narrative = explainer.generateLocalNarrative(report, createClassSummaries());
      const formatted = LLMExplainer.formatNarrativeForTerminal(narrative);

      expect(formatted).toContain('MEMORY INVESTIGATION REPORT');
      expect(formatted).toContain('Action Items');
    });
  });

  describe('conversation management', () => {
    it('should start a conversation', () => {
      const state = explainer.startConversation({
        classSummaries: createClassSummaries(),
      });

      expect(state.sessionId).toContain('inv-');
      expect(state.suggestedQuestions.length).toBeGreaterThan(0);
      expect(state.turns).toHaveLength(0);
    });

    it('should add turns to conversation', () => {
      explainer.startConversation({});
      explainer.addTurn('user', 'What is using the most memory?');
      explainer.addTurn('assistant', 'Map instances are the largest consumers.');

      const state = explainer.getConversation()!;
      expect(state.turns).toHaveLength(2);
      expect(state.turns[0].role).toBe('user');
      expect(state.turns[1].role).toBe('assistant');
    });

    it('should throw if adding turn without starting conversation', () => {
      expect(() => explainer.addTurn('user', 'test')).toThrow('No active conversation');
    });

    it('should generate contextual prompt with history', () => {
      explainer.startConversation({
        classSummaries: createClassSummaries(),
        rootCauseReport: createRootCauseReport(),
      });
      explainer.addTurn('user', 'What is the biggest issue?');

      const prompt = explainer.generateContextualPrompt('Tell me more about the Map issue');

      expect(prompt).toContain('What is the biggest issue?');
      expect(prompt).toContain('Tell me more about the Map issue');
      expect(prompt).toContain('Health: 40/100');
    });
  });

  describe('generateNarrativePrompt', () => {
    it('should generate prompt with report data', () => {
      const report = createRootCauseReport();
      const summaries = createClassSummaries();
      const prompt = explainer.generateNarrativePrompt(report, summaries);

      expect(prompt).toContain('40/100');
      expect(prompt).toContain('Large Map');
      expect(prompt).toContain('Map');
      expect(prompt).toContain('JSON format');
    });
  });

  describe('generateLeakExplanationPrompt', () => {
    it('should generate prompt for leak candidate', () => {
      const prompt = explainer.generateLeakExplanationPrompt({
        className: 'UserSession',
        countInSnapshot1: 100,
        countInSnapshot2: 200,
        countInSnapshot3: 300,
        growthRate: 100,
        totalLeakedSize: 10_000_000,
        retainerChains: [],
        confidence: 'high',
      });

      expect(prompt).toContain('UserSession');
      expect(prompt).toContain('100 → 200 → 300');
      expect(prompt).toContain('high');
    });
  });
});
