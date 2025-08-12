import { createTool } from '@mastra/core';
import { z } from 'zod';

export const codeAnalysisTool = createTool({
  id: 'analyze-code',
  description: 'Analyze code for quality, complexity, and potential issues',
  inputSchema: z.object({
    code: z.string().describe('Code content to analyze'),
    language: z.enum(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'auto']).default('auto').describe('Programming language'),
    analysisLevel: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed').describe('Level of analysis depth'),
  }),
  outputSchema: z.object({
    language: z.string(),
    metrics: z.object({
      lines: z.number(),
      functions: z.number(),
      classes: z.number(),
      complexity: z.enum(['low', 'medium', 'high']),
      maintainabilityIndex: z.number().min(0).max(100),
    }),
    issues: z.array(z.object({
      type: z.enum(['error', 'warning', 'info', 'style']),
      message: z.string(),
      line: z.number().optional(),
      severity: z.enum(['low', 'medium', 'high']),
    })),
    suggestions: z.array(z.string()),
    qualityScore: z.number().min(0).max(10),
  }),
  execute: async ({ context }) => {
    const { code, language: inputLanguage, analysisLevel } = context;
    
    const detectedLanguage = inputLanguage === 'auto' ? detectLanguage(code) : inputLanguage;
    const lines = code.split('\n').length;
    
    const functionMatches = code.match(/function\s+\w+|def\s+\w+|fn\s+\w+|\w+\s*\(/g) || [];
    const classMatches = code.match(/class\s+\w+|struct\s+\w+/g) || [];
    
    const complexity = calculateComplexity(code);
    const maintainabilityIndex = calculateMaintainabilityIndex(code, complexity);
    
    const issues = analyzeIssues(code, detectedLanguage, analysisLevel);
    const suggestions = generateSuggestions(code, issues);
    const qualityScore = calculateQualityScore(maintainabilityIndex, issues);

    return {
      language: detectedLanguage,
      metrics: {
        lines,
        functions: functionMatches.length,
        classes: classMatches.length,
        complexity,
        maintainabilityIndex,
      },
      issues,
      suggestions,
      qualityScore,
    };
  },
});

function detectLanguage(code: string): string {
  if (code.includes('def ') || code.includes('import ') && code.includes(':')) {
    return 'python';
  }
  if (code.includes('function') || code.includes('const ') || code.includes('=>')) {
    return code.includes('interface') || code.includes('type ') ? 'typescript' : 'javascript';
  }
  if (code.includes('fn ') || code.includes('impl ') || code.includes('struct ')) {
    return 'rust';
  }
  if (code.includes('func ') || code.includes('package ')) {
    return 'go';
  }
  if (code.includes('public class') || code.includes('import java.')) {
    return 'java';
  }
  return 'unknown';
}

function calculateComplexity(code: string): 'low' | 'medium' | 'high' {
  const complexityIndicators = [
    /if\s*\(/g,
    /for\s*\(/g,
    /while\s*\(/g,
    /switch\s*\(/g,
    /catch\s*\(/g,
    /&&|\|\|/g,
  ];
  
  let totalComplexity = 0;
  complexityIndicators.forEach(pattern => {
    const matches = code.match(pattern);
    if (matches) totalComplexity += matches.length;
  });
  
  const normalizedComplexity = totalComplexity / code.split('\n').length;
  
  if (normalizedComplexity < 0.1) return 'low';
  if (normalizedComplexity < 0.3) return 'medium';
  return 'high';
}

function calculateMaintainabilityIndex(code: string, complexity: 'low' | 'medium' | 'high'): number {
  const baseScore = 100;
  const lines = code.split('\n').length;
  const complexityPenalty = complexity === 'high' ? 30 : complexity === 'medium' ? 15 : 5;
  const lengthPenalty = Math.min(lines / 50, 20);
  
  return Math.max(0, Math.min(100, baseScore - complexityPenalty - lengthPenalty));
}

function analyzeIssues(code: string, language: string, level: string): Array<{
  type: 'error' | 'warning' | 'info' | 'style';
  message: string;
  line?: number;
  severity: 'low' | 'medium' | 'high';
}> {
  const issues: Array<{
    type: 'error' | 'warning' | 'info' | 'style';
    message: string;
    line?: number;
    severity: 'low' | 'medium' | 'high';
  }> = [];

  const lines = code.split('\n');
  
  lines.forEach((line, index) => {
    if (line.length > 120) {
      issues.push({
        type: 'style',
        message: 'Line too long (>120 characters)',
        line: index + 1,
        severity: 'low',
      });
    }
    
    if (/console\.log|print\(/.test(line)) {
      issues.push({
        type: 'warning',
        message: 'Debug statement found',
        line: index + 1,
        severity: 'low',
      });
    }
    
    if (/TODO|FIXME|HACK/.test(line)) {
      issues.push({
        type: 'info',
        message: 'TODO/FIXME comment found',
        line: index + 1,
        severity: 'low',
      });
    }
  });
  
  if (language === 'javascript' || language === 'typescript') {
    if (code.includes('var ')) {
      issues.push({
        type: 'warning',
        message: 'Use of var keyword (prefer const/let)',
        severity: 'medium',
      });
    }
    
    if (code.includes('eval(')) {
      issues.push({
        type: 'error',
        message: 'Use of eval() is dangerous',
        severity: 'high',
      });
    }
  }
  
  return issues;
}

function generateSuggestions(code: string, issues: Array<{ type: string; severity: string }>): string[] {
  const suggestions: string[] = [];
  
  if (issues.some(i => i.type === 'style')) {
    suggestions.push('Consider using a code formatter like Prettier');
  }
  
  if (issues.some(i => i.severity === 'high')) {
    suggestions.push('Address high-severity issues immediately for security and stability');
  }
  
  if (code.split('\n').length > 100) {
    suggestions.push('Consider breaking this code into smaller, more focused functions or modules');
  }
  
  if (!code.includes('//') && !code.includes('/*') && !code.includes('#')) {
    suggestions.push('Add comments to explain complex logic and improve maintainability');
  }
  
  return suggestions;
}

function calculateQualityScore(maintainabilityIndex: number, issues: Array<{ severity: string }>): number {
  const baseScore = maintainabilityIndex / 10;
  
  const highSeverityIssues = issues.filter(i => i.severity === 'high').length;
  const mediumSeverityIssues = issues.filter(i => i.severity === 'medium').length;
  const lowSeverityIssues = issues.filter(i => i.severity === 'low').length;
  
  const penalty = (highSeverityIssues * 2) + (mediumSeverityIssues * 1) + (lowSeverityIssues * 0.5);
  
  return Math.max(0, Math.min(10, baseScore - penalty));
}