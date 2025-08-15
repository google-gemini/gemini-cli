/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { claudeCodeTool } from "../tools/claude-code.js";

/**
 * Simplified single-step code review workflow
 */

const codeReviewInputSchema = z.object({
  codeContent: z.string().describe("The code content to review"),
  filePath: z.string().optional().describe("Optional file path for context"),
  language: z.string().optional().describe("Programming language (e.g., 'javascript', 'python', 'typescript')"),
  reviewType: z.enum(["full", "security", "performance", "style"]).default("full").describe("Type of review to perform"),
  includeDocumentation: z.boolean().default(true).describe("Whether to generate documentation"),
});

const codeReviewOutputSchema = z.object({
  summary: z.object({
    overallScore: z.number().min(0).max(10).describe("Overall code quality score (0-10)"),
    issuesFound: z.number().describe("Total number of issues found"),
    recommendations: z.number().describe("Number of improvement recommendations"),
    language: z.string().describe("Detected programming language"),
  }),
  analysis: z.object({
    codeQuality: z.object({
      score: z.number().min(0).max(10),
      issues: z.array(z.string()),
      strengths: z.array(z.string()),
    }),
    securityFindings: z.array(z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      issue: z.string(),
      recommendation: z.string(),
      lineNumber: z.number().optional(),
    })),
    performanceIssues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      suggestion: z.string(),
    })),
  }),
  recommendations: z.array(z.object({
    category: z.enum(["code-quality", "performance", "security", "maintainability"]),
    priority: z.enum(["low", "medium", "high"]),
    description: z.string(),
    example: z.string().optional(),
  })),
  documentation: z.object({
    generatedDocs: z.string().optional(),
    apiDocumentation: z.string().optional(),
    usageExamples: z.string().optional(),
  }).optional(),
});

/**
 * Single comprehensive code review step
 */
const comprehensiveReviewStep = createStep({
  id: "comprehensive-review",
  description: "Perform complete code review including quality, security, performance analysis",
  inputSchema: codeReviewInputSchema,
  outputSchema: codeReviewOutputSchema,
  execute: async ({ inputData }) => {
    const { codeContent, language, filePath, reviewType, includeDocumentation } = inputData;

    const comprehensivePrompt = `
Please perform a comprehensive code review on the following code:

${filePath ? `File Path: ${filePath}` : ''}
${language ? `Language: ${language}` : ''}
Review Type: ${reviewType}

Code to review:
\`\`\`
${codeContent}
\`\`\`

Please provide a detailed analysis covering:

1. **Code Quality Assessment** (0-10 score):
   - Code structure and organization
   - Readability and maintainability  
   - Best practices adherence
   - Specific issues and strengths

2. **Security Analysis** (if applicable):
   - Security vulnerabilities (SQL injection, XSS, etc.)
   - Authentication and authorization issues
   - Input validation problems
   - Categorize by severity: critical/high/medium/low

3. **Performance Review** (if applicable):
   - Algorithm complexity analysis
   - Memory usage patterns
   - Performance bottlenecks
   - Optimization opportunities
   - Categorize impact: high/medium/low

4. **Recommendations**:
   - Prioritized improvement suggestions
   - Specific code examples where helpful
   - Categorize by: code-quality/performance/security/maintainability
   - Set priority: high/medium/low

${includeDocumentation ? `
5. **Documentation Generation**:
   - API documentation for functions/classes
   - Usage examples
   - Parameter descriptions and return values
` : ''}

Please format your response clearly with sections for each analysis area. Provide specific, actionable feedback.
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: comprehensivePrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are an expert code reviewer with deep knowledge in software quality, security, and performance. Provide thorough, constructive feedback with specific examples and actionable recommendations.",
          maxTurns: 25,
          allowedTools: ["read", "grep", "web_search"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    const reviewText = result.result;
    
    // Parse the comprehensive review response
    const analysisResult = parseComprehensiveReview(reviewText, includeDocumentation);
    
    return analysisResult;
  },
});

/**
 * Simplified code review workflow
 */
export const simpleCodeReviewWorkflow = createWorkflow({
  id: "simple-code-review-workflow",
  description: "Simplified comprehensive code review using Claude Code",
  inputSchema: codeReviewInputSchema,
  outputSchema: codeReviewOutputSchema,
})
  .then(comprehensiveReviewStep)
  .commit();

// Helper function to parse comprehensive review response
function parseComprehensiveReview(reviewText: string, includeDocumentation: boolean) {
  // Basic parsing - in production, you'd want more sophisticated parsing
  
  // Extract quality score
  let qualityScore = 7; // Default
  const scoreMatch = reviewText.match(/(?:score|quality)[:\s]*(\d+(?:\.\d+)?)/i);
  if (scoreMatch) {
    qualityScore = Math.min(10, Math.max(0, parseFloat(scoreMatch[1])));
  }

  // Extract issues and strengths
  const issues = [];
  const strengths = [];
  
  if (reviewText.toLowerCase().includes("bug") || reviewText.toLowerCase().includes("error")) {
    issues.push("Potential bugs or errors detected");
  }
  if (reviewText.toLowerCase().includes("security")) {
    issues.push("Security considerations noted");
  }
  if (reviewText.toLowerCase().includes("performance")) {
    issues.push("Performance concerns identified");
  }
  if (reviewText.toLowerCase().includes("well-structured") || reviewText.toLowerCase().includes("clean")) {
    strengths.push("Clean, well-structured code");
  }
  if (reviewText.toLowerCase().includes("documented") || reviewText.toLowerCase().includes("comments")) {
    strengths.push("Good documentation and comments");
  }

  // Extract security findings
  const securityFindings = [];
  if (reviewText.toLowerCase().includes("sql injection")) {
    const severity = reviewText.toLowerCase().includes("critical") ? "critical" as const : "high" as const;
    securityFindings.push({
      severity,
      issue: "Potential SQL injection vulnerability",
      recommendation: "Use parameterized queries or prepared statements",
    });
  }
  if (reviewText.toLowerCase().includes("xss") || reviewText.toLowerCase().includes("cross-site")) {
    securityFindings.push({
      severity: "medium" as const,
      issue: "Cross-site scripting (XSS) risk",
      recommendation: "Implement proper input sanitization and output encoding",
    });
  }

  // Extract performance issues
  const performanceIssues = [];
  if (reviewText.toLowerCase().includes("o(n") || reviewText.toLowerCase().includes("complexity")) {
    performanceIssues.push({
      type: "Algorithm Complexity",
      description: "Inefficient algorithm complexity detected",
      impact: "medium" as const,
      suggestion: "Consider optimizing algorithm complexity or caching results",
    });
  }
  if (reviewText.toLowerCase().includes("memory") || reviewText.toLowerCase().includes("leak")) {
    performanceIssues.push({
      type: "Memory Usage",
      description: "Potential memory inefficiency identified",
      impact: "high" as const,
      suggestion: "Review memory allocation and cleanup patterns",
    });
  }

  // Generate recommendations
  const recommendations = [];
  securityFindings.forEach(finding => {
    recommendations.push({
      category: "security" as const,
      priority: (finding.severity === "critical" || finding.severity === "high") ? "high" as const : "medium" as const,
      description: `Address security issue: ${finding.issue}`,
    });
  });
  
  performanceIssues.forEach(issue => {
    recommendations.push({
      category: "performance" as const,
      priority: issue.impact === "high" ? "high" as const : "medium" as const,
      description: `Optimize performance: ${issue.description}`,
    });
  });

  if (reviewText.toLowerCase().includes("refactor") || reviewText.toLowerCase().includes("clean")) {
    recommendations.push({
      category: "code-quality" as const,
      priority: "medium" as const,
      description: "Refactor code for better readability and maintainability",
    });
  }

  // Extract documentation if requested
  let documentation = undefined;
  if (includeDocumentation) {
    const docSections = reviewText.split('\n\n');
    documentation = {
      generatedDocs: reviewText,
      apiDocumentation: docSections.find(s => s.toLowerCase().includes("api")) || undefined,
      usageExamples: docSections.find(s => s.toLowerCase().includes("example")) || undefined,
    };
  }

  // Detect language from code
  const language = detectLanguageFromReview(reviewText);

  // Calculate overall score
  const securityScore = Math.max(0, 10 - (securityFindings.length * 2));
  const performanceScore = Math.max(0, 10 - (performanceIssues.length * 1.5));
  const overallScore = Math.round((qualityScore + securityScore + performanceScore) / 3);

  return {
    summary: {
      overallScore,
      issuesFound: issues.length + securityFindings.length + performanceIssues.length,
      recommendations: recommendations.length,
      language,
    },
    analysis: {
      codeQuality: {
        score: qualityScore,
        issues: issues.length > 0 ? issues : ["No major issues detected"],
        strengths: strengths.length > 0 ? strengths : ["Code follows basic standards"],
      },
      securityFindings,
      performanceIssues,
    },
    recommendations,
    documentation,
  };
}

function detectLanguageFromReview(reviewText: string): string {
  if (reviewText.includes("JavaScript") || reviewText.includes("JS")) return "javascript";
  if (reviewText.includes("TypeScript") || reviewText.includes("TS")) return "typescript";
  if (reviewText.includes("Python")) return "python";
  if (reviewText.includes("Java")) return "java";
  if (reviewText.includes("C++") || reviewText.includes("cpp")) return "cpp";
  return "unknown";
}