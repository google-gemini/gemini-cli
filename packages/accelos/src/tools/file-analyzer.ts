import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

export const fileAnalyzerTool = createTool({
  id: 'analyze-file',
  description: 'Analyze a file and provide insights about its content, structure, and purpose',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to analyze'),
    analysisType: z.enum(['content', 'structure', 'security', 'all']).default('all').describe('Type of analysis to perform'),
  }),
  outputSchema: z.object({
    fileInfo: z.object({
      name: z.string(),
      size: z.number(),
      extension: z.string(),
      lastModified: z.string(),
    }),
    content: z.string().optional(),
    analysis: z.object({
      contentType: z.string(),
      lineCount: z.number().optional(),
      language: z.string().optional(),
      complexity: z.enum(['low', 'medium', 'high']).optional(),
      insights: z.array(z.string()),
    }),
    securityIssues: z.array(z.string()).optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { filePath, analysisType } = context;
      const stats = await fs.stat(filePath);
      const fileInfo = {
        name: path.basename(filePath),
        size: stats.size,
        extension: path.extname(filePath),
        lastModified: stats.mtime.toISOString(),
      };

      let content: string | undefined;
      let analysis: any = {
        contentType: 'unknown',
        insights: [],
      };
      let securityIssues: string[] = [];

      if (analysisType === 'content' || analysisType === 'all') {
        try {
          content = await fs.readFile(filePath, 'utf-8');
          
          analysis.lineCount = content.split('\n').length;
          
          const extension = fileInfo.extension.toLowerCase();
          if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
            analysis.language = 'javascript/typescript';
            analysis.contentType = 'code';
            analysis.complexity = content.length > 5000 ? 'high' : content.length > 1000 ? 'medium' : 'low';
            analysis.insights.push(`Contains ${content.match(/function|const|class/g)?.length || 0} function/class definitions`);
          } else if (['.py'].includes(extension)) {
            analysis.language = 'python';
            analysis.contentType = 'code';
            analysis.complexity = content.length > 5000 ? 'high' : content.length > 1000 ? 'medium' : 'low';
            analysis.insights.push(`Contains ${content.match(/def |class /g)?.length || 0} function/class definitions`);
          } else if (['.md', '.txt'].includes(extension)) {
            analysis.contentType = 'text';
            analysis.insights.push(`Document with ${content.split(' ').length} words`);
          } else if (['.json'].includes(extension)) {
            analysis.contentType = 'data';
            try {
              const jsonData = JSON.parse(content);
              analysis.insights.push(`Valid JSON with ${Object.keys(jsonData).length} top-level properties`);
            } catch {
              analysis.insights.push('Invalid JSON format');
            }
          }
        } catch (error) {
          analysis.insights.push('File content could not be read (binary or permission issue)');
        }
      }

      if (analysisType === 'security' || analysisType === 'all') {
        if (content) {
          const securityPatterns = [
            { pattern: /password\s*=\s*['"]\w+['"]/, issue: 'Hardcoded password detected' },
            { pattern: /api[_-]?key\s*=\s*['"]\w+['"]/, issue: 'Hardcoded API key detected' },
            { pattern: /eval\s*\(/, issue: 'Use of eval() function detected' },
            { pattern: /innerHTML\s*=/, issue: 'Potential XSS vulnerability with innerHTML' },
          ];

          for (const { pattern, issue } of securityPatterns) {
            if (pattern.test(content)) {
              securityIssues.push(issue);
            }
          }
        }
      }

      return {
        fileInfo,
        content: analysisType === 'content' || analysisType === 'all' ? content : undefined,
        analysis,
        securityIssues: securityIssues.length > 0 ? securityIssues : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});