/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FunctionCallEvaluator } from './functionCallEvaluator.js';
import { TrustContentGenerator } from './trustContentGenerator.js';

describe('FunctionCallEvaluator', () => {
  let evaluator: FunctionCallEvaluator;
  let mockContentGenerator: any;

  beforeEach(() => {
    // Mock the content generator
    mockContentGenerator = {
      generateContent: vi.fn(),
      getCurrentModel: vi.fn().mockReturnValue({ name: 'test-model' })
    };
    
    evaluator = new FunctionCallEvaluator(mockContentGenerator);
  });

  describe('Basic functionality', () => {
    it('should create evaluation prompts', () => {
      const prompts = (evaluator as any).evaluationPrompts;
      expect(prompts).toBeDefined();
      expect(prompts.length).toBe(50);
      expect(prompts[0]).toHaveProperty('id');
      expect(prompts[0]).toHaveProperty('description');
      expect(prompts[0]).toHaveProperty('prompt');
      expect(prompts[0]).toHaveProperty('expectedTool');
      expect(prompts[0]).toHaveProperty('expectedArgs');
      expect(prompts[0]).toHaveProperty('category');
      expect(prompts[0]).toHaveProperty('difficulty');
    });

    it('should have diverse categories', () => {
      const prompts = (evaluator as any).evaluationPrompts;
      const categories = new Set(prompts.map((p: any) => p.category));
      
      expect(categories.has('file_operations')).toBe(true);
      expect(categories.has('shell_commands')).toBe(true);
      expect(categories.has('search')).toBe(true);
      expect(categories.has('web')).toBe(true);
      expect(categories.has('memory')).toBe(true);
      expect(categories.has('complex')).toBe(true);
    });

    it('should have different difficulty levels', () => {
      const prompts = (evaluator as any).evaluationPrompts;
      const difficulties = new Set(prompts.map((p: any) => p.difficulty));
      
      expect(difficulties.has('easy')).toBe(true);
      expect(difficulties.has('medium')).toBe(true);
      expect(difficulties.has('hard')).toBe(true);
    });
  });

  describe('Argument comparison', () => {
    it('should correctly compare exact matches', () => {
      const compareArgs = (evaluator as any).compareArgs.bind(evaluator);
      
      expect(compareArgs(
        { path: '/tmp', mode: 'read' },
        { path: '/tmp', mode: 'read' }
      )).toBe(true);
    });

    it('should handle partial string matches', () => {
      const compareArgs = (evaluator as any).compareArgs.bind(evaluator);
      
      expect(compareArgs(
        { command: 'ls -la /home/user' },
        { command: 'ls -la' }
      )).toBe(true);
    });

    it('should reject missing required arguments', () => {
      const compareArgs = (evaluator as any).compareArgs.bind(evaluator);
      
      expect(compareArgs(
        { path: '/tmp' },
        { path: '/tmp', mode: 'read' }
      )).toBe(false);
    });

    it('should reject different values', () => {
      const compareArgs = (evaluator as any).compareArgs.bind(evaluator);
      
      expect(compareArgs(
        { path: '/home', mode: 'write' },
        { path: '/tmp', mode: 'read' }
      )).toBe(false);
    });
  });

  describe('Summary generation', () => {
    it('should generate correct summary statistics', () => {
      const results = [
        {
          promptId: 'test1',
          success: true,
          validJson: true,
          correctTool: true,
          correctArgs: true,
          responseTime: 100,
          rawResponse: 'test',
          parsedCalls: []
        },
        {
          promptId: 'test2',
          success: false,
          validJson: false,
          correctTool: false,
          correctArgs: false,
          responseTime: 200,
          rawResponse: 'test',
          parsedCalls: []
        }
      ];
      
      const summary = (evaluator as any).generateSummary(results);
      
      expect(summary.totalPrompts).toBe(2);
      expect(summary.successfulCalls).toBe(1);
      expect(summary.validJsonRate).toBe(50);
      expect(summary.correctToolRate).toBe(50);
      expect(summary.correctArgsRate).toBe(50);
      expect(summary.averageResponseTime).toBe(150);
    });
  });
});