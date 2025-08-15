/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { claudeCodeTool } from "../tools/claude-code.js";

/**
 * Input schema for the code review workflow
 */
const codeReviewInputSchema = z.object({
  codeContent: z.string().describe("The code content to review"),
  filePath: z.string().optional().describe("Optional file path for context"),
  language: z.string().optional().describe("Programming language (e.g., 'javascript', 'python', 'typescript')"),
  reviewType: z.enum(["full", "security", "performance", "style"]).default("full").describe("Type of review to perform"),
  includeDocumentation: z.boolean().default(true).describe("Whether to generate documentation"),
});

/**
 * Output schema for the code review workflow
 */
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
 * Step 1: Code Analysis - Analyze code structure and quality
 */
const codeAnalysisStep = createStep({
  id: "code-analysis",
  description: "Analyze code structure, quality, and detect issues",
  inputSchema: codeReviewInputSchema,
  outputSchema: z.object({
    codeQuality: z.object({
      score: z.number().min(0).max(10),
      issues: z.array(z.string()),
      strengths: z.array(z.string()),
    }),
    language: z.string(),
    complexity: z.enum(["low", "medium", "high"]),
    maintainability: z.enum(["poor", "fair", "good", "excellent"]),
  }),
  execute: async ({ inputData }) => {
    const { codeContent, language, filePath } = inputData;

    const analysisPrompt = `
Please perform a comprehensive code analysis on the following code:

${filePath ? `File Path: ${filePath}` : ''}
${language ? `Language: ${language}` : ''}

Code to analyze:
\`\`\`
${codeContent}
\`\`\`

Analyze the code for:
1. Code quality and structure
2. Best practices adherence
3. Potential bugs or issues
4. Code complexity and maintainability
5. Language-specific conventions

Provide a detailed analysis with specific issues and strengths identified.
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: analysisPrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are an expert code reviewer. Analyze code thoroughly and provide constructive feedback with specific examples and line references where possible.",
          maxTurns: 15,
          allowedTools: ["read", "grep", "web_search"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    // Parse Claude Code's response to extract structured information
    const analysisText = result.result;
    
    // Extract quality score (default scoring logic)
    let qualityScore = 7; // Default score
    if (analysisText.toLowerCase().includes("excellent") || analysisText.toLowerCase().includes("high quality")) {
      qualityScore = 9;
    } else if (analysisText.toLowerCase().includes("good") || analysisText.toLowerCase().includes("well-written")) {
      qualityScore = 8;
    } else if (analysisText.toLowerCase().includes("needs improvement") || analysisText.toLowerCase().includes("issues")) {
      qualityScore = 6;
    } else if (analysisText.toLowerCase().includes("poor") || analysisText.toLowerCase().includes("problematic")) {
      qualityScore = 4;
    }

    // Extract issues and strengths (basic parsing)
    const issues = [];
    const strengths = [];
    
    if (analysisText.toLowerCase().includes("bug") || analysisText.toLowerCase().includes("error")) {
      issues.push("Potential bugs or errors detected");
    }
    if (analysisText.toLowerCase().includes("performance")) {
      issues.push("Performance concerns identified");
    }
    if (analysisText.toLowerCase().includes("security")) {
      issues.push("Security considerations noted");
    }
    if (analysisText.toLowerCase().includes("well-structured") || analysisText.toLowerCase().includes("clean")) {
      strengths.push("Clean, well-structured code");
    }
    if (analysisText.toLowerCase().includes("documented") || analysisText.toLowerCase().includes("comments")) {
      strengths.push("Good documentation and comments");
    }

    // Detect language if not provided
    const detectedLanguage = language || detectLanguageFromCode(codeContent);
    
    // Assess complexity
    const complexity = assessCodeComplexity(codeContent);
    
    // Assess maintainability
    const maintainability = assessMaintainability(qualityScore);

    return {
      codeQuality: {
        score: qualityScore,
        issues: issues.length > 0 ? issues : ["No major issues detected"],
        strengths: strengths.length > 0 ? strengths : ["Code follows basic standards"],
      },
      language: detectedLanguage,
      complexity,
      maintainability,
    };
  },
});

/**
 * Step 2: Security Audit - Identify security vulnerabilities
 */
const securityAuditStep = createStep({
  id: "security-audit",
  description: "Perform security vulnerability scanning and analysis",
  inputSchema: codeReviewInputSchema,
  outputSchema: z.object({
    securityFindings: z.array(z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      issue: z.string(),
      recommendation: z.string(),
      lineNumber: z.number().optional(),
    })),
    overallSecurityScore: z.number().min(0).max(10),
    complianceNotes: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { codeContent, language, filePath } = inputData;

    const securityPrompt = `
Perform a comprehensive security audit of the following code:

${filePath ? `File Path: ${filePath}` : ''}
${language ? `Language: ${language}` : ''}

Code to audit:
\`\`\`
${codeContent}
\`\`\`

Focus on identifying:
1. SQL injection vulnerabilities
2. Cross-site scripting (XSS) risks
3. Authentication and authorization issues
4. Input validation problems
5. Cryptographic weaknesses
6. Sensitive data exposure
7. Security misconfigurations
8. Dependency vulnerabilities
9. Code injection risks
10. Access control issues

For each finding, specify:
- Severity level (critical/high/medium/low)
- Specific issue description
- Line number if applicable
- Remediation recommendations
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: securityPrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are a cybersecurity expert specializing in secure code review. Identify security vulnerabilities with precision and provide actionable remediation guidance.",
          maxTurns: 20,
          allowedTools: ["read", "grep", "web_search"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    // Parse security findings from Claude Code's response
    const securityText = result.result;
    const securityFindings = parseSecurityFindings(securityText);
    
    // Calculate security score based on findings
    const overallSecurityScore = calculateSecurityScore(securityFindings);
    
    // Extract compliance notes
    const complianceNotes = extractComplianceNotes(securityText);

    return {
      securityFindings,
      overallSecurityScore,
      complianceNotes,
    };
  },
});

/**
 * Step 3: Performance Review - Analyze performance bottlenecks
 */
const performanceReviewStep = createStep({
  id: "performance-review",
  description: "Identify performance bottlenecks and optimization opportunities",
  inputSchema: codeReviewInputSchema,
  outputSchema: z.object({
    performanceIssues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      suggestion: z.string(),
    })),
    performanceScore: z.number().min(0).max(10),
    optimizationOpportunities: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { codeContent, language, filePath } = inputData;

    const performancePrompt = `
Analyze the following code for performance issues and optimization opportunities:

${filePath ? `File Path: ${filePath}` : ''}
${language ? `Language: ${language}` : ''}

Code to analyze:
\`\`\`
${codeContent}
\`\`\`

Focus on:
1. Algorithmic complexity (Big O analysis)
2. Memory usage patterns
3. I/O operations efficiency
4. Database query optimization
5. Loop optimization opportunities
6. Caching strategies
7. Lazy loading possibilities
8. Resource management
9. Async/await usage patterns
10. Data structure choices

For each performance issue found:
- Categorize the issue type
- Describe the specific problem
- Assess the performance impact (high/medium/low)
- Provide optimization suggestions with examples
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: performancePrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are a performance optimization expert. Analyze code for performance bottlenecks and provide specific, actionable optimization recommendations.",
          maxTurns: 15,
          allowedTools: ["read", "web_search"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    // Parse performance analysis results
    const performanceText = result.result;
    const performanceIssues = parsePerformanceIssues(performanceText);
    const performanceScore = calculatePerformanceScore(performanceIssues);
    const optimizationOpportunities = extractOptimizationOpportunities(performanceText);

    return {
      performanceIssues,
      performanceScore,
      optimizationOpportunities,
    };
  },
});

/**
 * Step 4: Enhancement Suggestions - Generate improvement recommendations
 */
const enhancementSuggestionsStep = createStep({
  id: "enhancement-suggestions",
  description: "Generate actionable improvement recommendations",
  inputSchema: z.object({
    codeContent: z.string(),
    codeQuality: z.object({
      score: z.number(),
      issues: z.array(z.string()),
      strengths: z.array(z.string()),
    }),
    securityFindings: z.array(z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      issue: z.string(),
      recommendation: z.string(),
    })),
    performanceIssues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      impact: z.enum(["low", "medium", "high"]),
    })),
    language: z.string(),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      category: z.enum(["code-quality", "performance", "security", "maintainability"]),
      priority: z.enum(["low", "medium", "high"]),
      description: z.string(),
      example: z.string().optional(),
    })),
    refactoringPlan: z.string(),
    nextSteps: z.array(z.string()),
  }),
  execute: async ({ inputData, getStepResult }) => {
    const { 
      codeContent, 
      codeQuality, 
      securityFindings, 
      performanceIssues, 
      language 
    } = inputData;

    const enhancementPrompt = `
Based on the comprehensive analysis of this ${language} code, provide actionable enhancement recommendations:

Code Quality Analysis:
- Score: ${codeQuality.score}/10
- Issues: ${codeQuality.issues.join(', ')}
- Strengths: ${codeQuality.strengths.join(', ')}

Security Findings: ${securityFindings.length} issues found
${securityFindings.map((f: any) => `- ${f.severity}: ${f.issue}`).join('\n')}

Performance Issues: ${performanceIssues.length} issues found
${performanceIssues.map((p: any) => `- ${p.impact} impact: ${p.description}`).join('\n')}

Original Code:
\`\`\`
${codeContent}
\`\`\`

Provide:
1. Prioritized recommendations for improvement
2. A high-level refactoring plan
3. Specific next steps for implementation
4. Code examples where helpful

Focus on actionable improvements that provide the most value.
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: enhancementPrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are a senior software architect. Provide strategic improvement recommendations that balance code quality, security, performance, and maintainability.",
          maxTurns: 20,
          allowedTools: ["read", "write", "web_search"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    const enhancementText = result.result;
    const recommendations = parseRecommendations(enhancementText, securityFindings, performanceIssues);
    const refactoringPlan = extractRefactoringPlan(enhancementText);
    const nextSteps = extractNextSteps(enhancementText);

    return {
      recommendations,
      refactoringPlan,
      nextSteps,
    };
  },
});

/**
 * Step 5: Documentation Generation - Create/update documentation
 */
const documentationGenerationStep = createStep({
  id: "documentation-generation",
  description: "Generate comprehensive documentation for the code",
  inputSchema: z.object({
    codeContent: z.string(),
    language: z.string(),
    filePath: z.string().optional(),
    includeDocumentation: z.boolean(),
  }),
  outputSchema: z.object({
    generatedDocs: z.string().optional(),
    apiDocumentation: z.string().optional(),
    usageExamples: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { codeContent, language, filePath, includeDocumentation } = inputData;

    if (!includeDocumentation) {
      return {
        generatedDocs: undefined,
        apiDocumentation: undefined,
        usageExamples: undefined,
      };
    }

    const documentationPrompt = `
Generate comprehensive documentation for the following ${language} code:

${filePath ? `File: ${filePath}` : ''}

Code:
\`\`\`
${codeContent}
\`\`\`

Please create:
1. General documentation explaining what the code does
2. API documentation for any public functions/methods/classes
3. Usage examples showing how to use the code
4. Parameter descriptions and return values
5. Any important notes or considerations

Format the documentation in clear, professional markdown suitable for developers.
`;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: documentationPrompt,
        options: {
          mode: "basic",
          cwd: process.env.REPOSITORY_PATH,
          customSystemPrompt: "You are a technical documentation expert. Create clear, comprehensive, and developer-friendly documentation.",
          maxTurns: 10,
          allowedTools: ["write", "read"],
          permissionMode: "default",
        },
      },
      runtimeContext: new (await import("@mastra/core/di")).RuntimeContext(),
    });

    const docText = result.result;
    const parsedDocs = parseGeneratedDocumentation(docText);

    return parsedDocs;
  },
});

/**
 * Step 6: Final Report - Compile comprehensive review results
 */
const finalReportStep = createStep({
  id: "final-report",
  description: "Compile all analysis results into a comprehensive report",
  inputSchema: z.object({
    codeQuality: z.object({
      score: z.number(),
      issues: z.array(z.string()),
      strengths: z.array(z.string()),
    }),
    securityFindings: z.array(z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      issue: z.string(),
      recommendation: z.string(),
    })),
    performanceIssues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      suggestion: z.string(),
    })),
    recommendations: z.array(z.object({
      category: z.enum(["code-quality", "performance", "security", "maintainability"]),
      priority: z.enum(["low", "medium", "high"]),
      description: z.string(),
    })),
    documentation: z.object({
      generatedDocs: z.string().optional(),
      apiDocumentation: z.string().optional(),
      usageExamples: z.string().optional(),
    }).optional(),
    language: z.string(),
    overallSecurityScore: z.number(),
    performanceScore: z.number(),
  }),
  outputSchema: codeReviewOutputSchema,
  execute: async ({ inputData }) => {
    const {
      codeQuality,
      securityFindings,
      performanceIssues,
      recommendations,
      documentation,
      language,
      overallSecurityScore,
      performanceScore,
    } = inputData;

    // Calculate overall score
    const overallScore = Math.round(
      (codeQuality.score + overallSecurityScore + performanceScore) / 3
    );

    // Count total issues and recommendations
    const issuesFound = 
      codeQuality.issues.length + 
      securityFindings.length + 
      performanceIssues.length;

    return {
      summary: {
        overallScore,
        issuesFound,
        recommendations: recommendations.length,
        language,
      },
      analysis: {
        codeQuality,
        securityFindings,
        performanceIssues,
      },
      recommendations,
      documentation,
    };
  },
});

/**
 * Main Code Review Workflow
 */
export const codeReviewWorkflow = createWorkflow({
  id: "code-review-workflow", 
  description: "Comprehensive automated code review using Claude Code",
  inputSchema: codeReviewInputSchema,
  outputSchema: codeReviewOutputSchema,
})
  .then(codeAnalysisStep)
  .then(securityAuditStep)
  .then(performanceReviewStep)
  .then(enhancementSuggestionsStep)
  .then(documentationGenerationStep)
  .then(finalReportStep)
  .commit();

// Helper functions for parsing Claude Code responses

function detectLanguageFromCode(code: string): string {
  if (code.includes("import ") && code.includes("export ")) return "javascript";
  if (code.includes("def ") && code.includes(":")) return "python";
  if (code.includes("interface ") || code.includes("type ")) return "typescript";
  if (code.includes("public class ") || code.includes("private ")) return "java";
  if (code.includes("#include") || code.includes("int main")) return "cpp";
  return "unknown";
}

function assessCodeComplexity(code: string): "low" | "medium" | "high" {
  const lines = code.split('\n').length;
  const nestedBlocks = (code.match(/\{|\}|\[|\]/g) || []).length;
  
  if (lines < 50 && nestedBlocks < 20) return "low";
  if (lines < 200 && nestedBlocks < 50) return "medium";
  return "high";
}

function assessMaintainability(qualityScore: number): "poor" | "fair" | "good" | "excellent" {
  if (qualityScore >= 9) return "excellent";
  if (qualityScore >= 7) return "good";
  if (qualityScore >= 5) return "fair";
  return "poor";
}

function parseSecurityFindings(securityText: string): Array<{
  severity: "low" | "medium" | "high" | "critical";
  issue: string;
  recommendation: string;
  lineNumber?: number;
}> {
  const findings = [];
  
  // Basic parsing - in a real implementation, you'd want more sophisticated parsing
  if (securityText.toLowerCase().includes("sql injection")) {
    findings.push({
      severity: "high" as const,
      issue: "Potential SQL injection vulnerability detected",
      recommendation: "Use parameterized queries or prepared statements",
    });
  }
  
  if (securityText.toLowerCase().includes("xss") || securityText.toLowerCase().includes("cross-site")) {
    findings.push({
      severity: "medium" as const,
      issue: "Cross-site scripting (XSS) risk identified",
      recommendation: "Implement proper input sanitization and output encoding",
    });
  }
  
  return findings;
}

function calculateSecurityScore(findings: Array<{ severity: string }>): number {
  let score = 10;
  findings.forEach(finding => {
    switch (finding.severity) {
      case "critical": score -= 3; break;
      case "high": score -= 2; break;
      case "medium": score -= 1; break;
      case "low": score -= 0.5; break;
    }
  });
  return Math.max(0, score);
}

function extractComplianceNotes(securityText: string): string[] {
  const notes = [];
  if (securityText.toLowerCase().includes("gdpr")) {
    notes.push("GDPR compliance considerations noted");
  }
  if (securityText.toLowerCase().includes("owasp")) {
    notes.push("OWASP security guidelines referenced");
  }
  return notes;
}

function parsePerformanceIssues(performanceText: string): Array<{
  type: string;
  description: string;
  impact: "low" | "medium" | "high";
  suggestion: string;
}> {
  const issues = [];
  
  if (performanceText.toLowerCase().includes("loop") || performanceText.toLowerCase().includes("o(n")) {
    issues.push({
      type: "Algorithm Complexity",
      description: "Inefficient loop or algorithm complexity detected",
      impact: "medium" as const,
      suggestion: "Consider optimizing algorithm complexity or caching results",
    });
  }
  
  if (performanceText.toLowerCase().includes("memory") || performanceText.toLowerCase().includes("leak")) {
    issues.push({
      type: "Memory Usage",
      description: "Potential memory inefficiency identified",
      impact: "high" as const,
      suggestion: "Review memory allocation and cleanup patterns",
    });
  }
  
  return issues;
}

function calculatePerformanceScore(issues: Array<{ impact: string }>): number {
  let score = 10;
  issues.forEach(issue => {
    switch (issue.impact) {
      case "high": score -= 2; break;
      case "medium": score -= 1; break;
      case "low": score -= 0.5; break;
    }
  });
  return Math.max(0, score);
}

function extractOptimizationOpportunities(performanceText: string): string[] {
  const opportunities = [];
  if (performanceText.toLowerCase().includes("cache") || performanceText.toLowerCase().includes("caching")) {
    opportunities.push("Implement caching strategy for frequently accessed data");
  }
  if (performanceText.toLowerCase().includes("async") || performanceText.toLowerCase().includes("await")) {
    opportunities.push("Optimize asynchronous operations and parallelization");
  }
  return opportunities;
}

function parseRecommendations(
  enhancementText: string, 
  securityFindings: Array<{ severity: string; issue: string }>, 
  performanceIssues: Array<{ impact: string; description: string }>
): Array<{
  category: "code-quality" | "performance" | "security" | "maintainability";
  priority: "low" | "medium" | "high";
  description: string;
  example?: string;
}> {
  const recommendations = [];
  
  // Add security recommendations
  securityFindings.forEach(finding => {
    recommendations.push({
      category: "security" as const,
      priority: finding.severity === "critical" || finding.severity === "high" ? "high" as const : "medium" as const,
      description: `Address security issue: ${finding.issue}`,
    });
  });
  
  // Add performance recommendations
  performanceIssues.forEach(issue => {
    recommendations.push({
      category: "performance" as const,
      priority: issue.impact === "high" ? "high" as const : "medium" as const,
      description: `Optimize performance: ${issue.description}`,
    });
  });
  
  // Add general code quality recommendations
  if (enhancementText.toLowerCase().includes("refactor") || enhancementText.toLowerCase().includes("clean")) {
    recommendations.push({
      category: "code-quality" as const,
      priority: "medium" as const,
      description: "Refactor code for better readability and maintainability",
    });
  }
  
  return recommendations;
}

function extractRefactoringPlan(enhancementText: string): string {
  // Extract refactoring plan from the enhancement text
  const lines = enhancementText.split('\n');
  const planLines = lines.filter(line => 
    line.toLowerCase().includes("plan") || 
    line.toLowerCase().includes("step") ||
    line.toLowerCase().includes("refactor")
  );
  
  return planLines.length > 0 
    ? planLines.join('\n') 
    : "Consider gradual refactoring focusing on high-impact improvements first.";
}

function extractNextSteps(enhancementText: string): string[] {
  const steps: string[] = [];
  const lines = enhancementText.split('\n');
  
  lines.forEach(line => {
    if (line.match(/^\d+\./) || line.toLowerCase().includes("next") || line.toLowerCase().includes("todo")) {
      steps.push(line.trim());
    }
  });
  
  return steps.length > 0 ? steps : [
    "Address critical security issues first",
    "Optimize performance bottlenecks",
    "Improve code documentation",
    "Add comprehensive tests",
    "Review and refactor complex functions"
  ];
}

function parseGeneratedDocumentation(docText: string): {
  generatedDocs?: string;
  apiDocumentation?: string;
  usageExamples?: string;
} {
  // Simple parsing - in practice, you'd want more sophisticated extraction
  const sections = docText.split('\n\n');
  
  return {
    generatedDocs: docText,
    apiDocumentation: sections.find(s => s.toLowerCase().includes("api")) || undefined,
    usageExamples: sections.find(s => s.toLowerCase().includes("example")) || undefined,
  };
}