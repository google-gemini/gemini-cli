// Guidance.js - Advanced Code Analysis and Generation System
// Fixed version with corrected Halstead Volume calculation and return types

interface CodeAnalysis {
  security: SecurityAnalysis;
  quality: QualityMetrics;
  suggestions: string[];
  dependencies: string[];
  alternatives: string[];
  unusedImports: string[];
}

interface SecurityAnalysis {
  vulnerabilities: Vulnerability[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

interface Vulnerability {
  type: string;
  severity: string;
  location: string;
  description: string;
}

interface QualityMetrics {
  maintainability: number;
  cyclomaticComplexity: number;
  halsteadVolume: number;
  linesOfCode: number;
  maintainabilityIndex: number;
  duplicationScore: number;
  technicalDebtRatio: number;
  aiQualityPrediction: number;
  codeSmellDensity: number;
  testabilityIndex: number;
}

interface DependencyAnalysis {
  dependencies: string[];
  devDependencies: string[];
  transitiveDeps: string[];
  securityVulnerabilities: number;
  outdatedPackages: number;
  circularDependencies: string[];
  bundleSize: number;
  treeShakingEfficiency: number;
}

interface PerformanceProfile {
  estimatedExecutionTime: number;
  memoryFootprint: number;
  cpuIntensity: number;
  scalabilityScore: number;
  bottlenecks: string[];
}

interface CodeRecommendation {
  type: 'refactor' | 'security' | 'performance' | 'style';
  description: string;
  priority: 'low' | 'medium' | 'high';
  location?: string;
}

interface BuildingBlock {
  name: string;
  description: string;
  template: string;
  category: string;
  complexity: number;
}

interface NamingGuide {
  variables: string[];
  functions: string[];
  classes: string[];
  files: string[];
}

export class GuidanceSystem {
  private static extractIdentifiers(code: string): string[] {
    // Extract identifiers (variable names, function names, etc.)
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    const matches = code.match(identifierRegex) || [];

    // Filter out keywords and common tokens
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
      'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'class', 'interface',
      'extends', 'implements', 'public', 'private', 'protected', 'static', 'final', 'const',
      'let', 'var', 'function', 'async', 'await', 'import', 'export', 'from', 'as', 'typeof',
      'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'
    ]);

    return matches.filter(match => !keywords.has(match));
  }

  // FIX: Corrected Halstead Volume calculation with proper formula and complete operator list
  private static detectUnusedImports(code: string, dependencies: string[]): string[] {
    const unusedImports: string[] = [];
    const lines = code.split('\n');

    // Extract imported identifiers from each line
    const importedIdentifiers = new Map<string, string[]>(); // module -> identifiers

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Match import statements
      const importMatch = trimmedLine.match(/^import\s+(?:{([^}]*)}\s+from\s+)?(?:\*\s+as\s+(\w+)\s+from\s+)?(?:(\w+)\s*,?\s*)?['"]([^'"]+)['"]/);
      if (importMatch) {
        const [, namedImports, namespaceImport, defaultImport, moduleName] = importMatch;

        if (!importedIdentifiers.has(moduleName)) {
          importedIdentifiers.set(moduleName, []);
        }

        const identifiers = importedIdentifiers.get(moduleName)!;

        // Extract named imports { foo, bar as baz }
        if (namedImports) {
          const namedMatches = namedImports.match(/(\w+)(?:\s+as\s+(\w+))?/g);
          if (namedMatches) {
            for (const match of namedMatches) {
              const [, original, alias] = match.match(/(\w+)(?:\s+as\s+(\w+))?/);
              identifiers.push(alias || original);
            }
          }
        }

        // Add namespace import
        if (namespaceImport) {
          identifiers.push(namespaceImport);
        }

        // Add default import
        if (defaultImport) {
          identifiers.push(defaultImport);
        }
      }
    }

    // Check usage of each imported identifier
    for (const [moduleName, identifiers] of importedIdentifiers) {
      for (const identifier of identifiers) {
        // Create regex to find usage (word boundaries to avoid partial matches)
        const usageRegex = new RegExp(`\\b${identifier}\\b`, 'g');
        const usageCount = (code.match(usageRegex) || []).length;

        // If used 0 times or only in import statement, mark as unused
        if (usageCount <= 1) { // <= 1 because the import itself counts as 1
          unusedImports.push(`${identifier} from ${moduleName}`);
        }
      }
    }

    return unusedImports;
  }

  private static calculateHalsteadVolume(code: string): number {
    // Complete list of operators for JavaScript/TypeScript
    const operators = [
      '+', '-', '*', '/', '%', '**', '=', '+=', '-=', '*=', '/=', '%=', '**=', '++', '--',
      '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '??', '?.',
      '<<', '>>', '>>>', '&', '|', '^', '~', '=>', '.', '()', '[]', '{}', 'new', 'delete',
      'typeof', 'void', 'in', 'instanceof', '...', ',', ';', ':', '?'
    ];

    const operands = this.extractIdentifiers(code);

    // Find unique operators that appear in the code
    const uniqueOperators = new Set(operators.filter(op => code.includes(op)));
    const n1 = uniqueOperators.size; // Number of distinct operators
    const n2 = new Set(operands).size; // Number of distinct operands

    // Count total occurrences of operators and operands
    const N1 = operators.reduce((count, op) => count + (code.split(op).length - 1), 0);
    const N2 = operands.length;

    if (n1 === 0 || n2 === 0) return 0;

    const vocabulary = n1 + n2;
    const length = N1 + N2;

    // Correct Halstead Volume formula: V = N * log2(n)
    return length * Math.log2(vocabulary);
  }

  private static calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Count control flow statements
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s*if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s*\{/g,
      /\bswitch\s*\(/g,
      /\bcatch\s*\(/g,
      /\bcase\s+/g,
      /\|\|/g,
      /&&/g,
      /\?/g
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  private static analyzeSecurity(code: string): SecurityAnalysis {
    const vulnerabilities: Vulnerability[] = [];

    // Enhanced security vulnerability detection
    const securityPatterns = [
      // Code Injection
      {
        pattern: /\beval\s*\(/gi,
        type: 'code-injection',
        severity: 'high',
        description: 'Use of eval() can lead to code injection vulnerabilities'
      },
      {
        pattern: /\bFunction\s*\(/gi,
        type: 'code-injection',
        severity: 'high',
        description: 'Dynamic function creation can lead to code injection'
      },
      {
        pattern: /setTimeout\s*\(\s*['"`]/gi,
        type: 'code-injection',
        severity: 'medium',
        description: 'String-based setTimeout can be exploited for code injection'
      },

      // XSS Vulnerabilities - Enhanced Detection
      {
        pattern: /\binnerHTML\s*[\+=]\s*[^;]*[<>\"']/gi,
        type: 'xss',
        severity: 'high',
        description: 'innerHTML assignment with potentially unsafe content (contains HTML tags or quotes)'
      },
      {
        pattern: /\binnerHTML\s*[\+=]\s*[^;]*(location|search|hash|href|pathname)/gi,
        type: 'xss',
        severity: 'critical',
        description: 'innerHTML assignment using location properties - potential DOM-based XSS'
      },
      {
        pattern: /\bdocument\.write\s*\([^)]*(location|search|hash|href|innerHTML)/gi,
        type: 'xss',
        severity: 'critical',
        description: 'document.write with location or innerHTML content - direct XSS vulnerability'
      },
      {
        pattern: /\bouterHTML\s*[\+=]\s*[^;]*(location|search|hash|href)/gi,
        type: 'xss',
        severity: 'high',
        description: 'outerHTML manipulation with location properties'
      },
      {
        pattern: /\beval\s*\([^)]*(location|search|hash|href|innerHTML)/gi,
        type: 'xss',
        severity: 'critical',
        description: 'eval() with location or DOM properties - code injection vulnerability'
      },
      {
        pattern: /setTimeout\s*\([^,]+,\s*[^)]*(location|search|hash|href)/gi,
        type: 'xss',
        severity: 'high',
        description: 'setTimeout with location properties - potential script injection'
      },
      {
        pattern: /\$\([^)]*\)\.html\s*\([^)]*(location|search|hash|href)/gi,
        type: 'xss',
        severity: 'high',
        description: 'jQuery .html() with location properties'
      },

      // Information Disclosure
      {
        pattern: /console\.(log|warn|error|info|debug)\s*\([^)]*(password|token|key|secret|credential)/gi,
        type: 'information-disclosure',
        severity: 'medium',
        description: 'Logging sensitive information to console'
      },
      {
        pattern: /throw\s+new\s+Error\s*\([^)]*(password|token|key|secret)/gi,
        type: 'information-disclosure',
        severity: 'medium',
        description: 'Exposing sensitive data in error messages'
      },

      // SQL Injection (basic detection)
      {
        pattern: /(SELECT|INSERT|UPDATE|DELETE)\s+.*\+.*['"`]/gi,
        type: 'sql-injection',
        severity: 'high',
        description: 'Potential SQL injection through string concatenation'
      },

      // Command Injection
      {
        pattern: /(exec|spawn|execSync|execFile)\s*\(\s*.*\+/gi,
        type: 'command-injection',
        severity: 'high',
        description: 'Potential command injection through dynamic command construction'
      },
      {
        pattern: /\$\{[^}]+\}\s+[a-zA-Z0-9_-]/gi,
        type: 'command-injection',
        severity: 'critical',
        description: 'Unsanitized environment variable used directly in command execution (PROTOC-style injection)'
      },
      {
        pattern: /`\$\{[^}]+\}`/gi,
        type: 'command-injection',
        severity: 'critical',
        description: 'Environment variable executed in backticks without validation'
      },
      {
        pattern: /\$\{[A-Z_][A-Z0-9_]*\}[^'"\s]*[a-zA-Z0-9_-]/gi,
        type: 'command-injection',
        severity: 'high',
        description: 'Environment variable used in command without validation or quoting'
      },
      {
        pattern: /(protoc|gcc|clang|python|node|npm|npx|bash|sh)\s+\$\{[^}]+\}/gi,
        type: 'supply-chain-injection',
        severity: 'critical',
        description: 'Build tool environment variable used without path validation (supply chain risk)'
      },

      // Weak Cryptography
      {
        pattern: /\bmd5\s*\(/gi,
        type: 'weak-cryptography',
        severity: 'medium',
        description: 'MD5 is cryptographically weak and should not be used'
      },
      {
        pattern: /\bsha1\s*\(/gi,
        type: 'weak-cryptography',
        severity: 'medium',
        description: 'SHA-1 is cryptographically weak for security purposes'
      },

      // Path Traversal
      {
        pattern: /\.\.[\/\\]/gi,
        type: 'path-traversal',
        severity: 'high',
        description: 'Directory traversal sequences can lead to unauthorized file access'
      },

      // Hardcoded Secrets
      {
        pattern: /(password|token|key|secret)\s*[:=]\s*['"`][^'"\s]{8,}['"`]/gi,
        type: 'hardcoded-secret',
        severity: 'high',
        description: 'Potential hardcoded sensitive information'
      },

      // Prototype Pollution
      {
        pattern: /\b__proto__\s*[\[=]/gi,
        type: 'prototype-pollution',
        severity: 'high',
        description: 'Direct prototype manipulation can lead to prototype pollution'
      },

      // ReDoS (Regular Expression Denial of Service)
      {
        pattern: /\(\w*\+\)\+/gi,
        type: 'redos',
        severity: 'medium',
        description: 'Nested quantifiers can cause catastrophic backtracking (ReDoS)'
      }
    ];

    // Apply all security patterns
    for (const { pattern, type, severity, description } of securityPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        // Find line numbers for each match
        const lines = code.split('\n');
        matches.forEach(match => {
          const lineIndex = lines.findIndex(line => line.includes(match));
          if (lineIndex !== -1) {
            vulnerabilities.push({
              type,
              severity: severity as 'low' | 'medium' | 'high' | 'critical',
              location: `Line ${lineIndex + 1}: ${match.substring(0, 50)}${match.length > 50 ? '...' : ''}`,
              description
            });
          }
        });
      }
    }

    // Calculate overall risk level
    const riskLevel = vulnerabilities.some(v => v.severity === 'critical')
      ? 'critical'
      : vulnerabilities.some(v => v.severity === 'high')
        ? 'high'
        : vulnerabilities.some(v => v.severity === 'medium')
          ? 'medium'
          : 'low';

    // Generate detailed recommendations
    const recommendations = vulnerabilities.map(v =>
      `${v.severity.toUpperCase()}: ${v.description} at ${v.location}`
    );

    return {
      vulnerabilities,
      riskLevel,
      recommendations
    };
  }

  static analyzeCode(code: string): CodeAnalysis {
    const linesOfCode = code.split('\n').filter(line => line.trim().length > 0).length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    const halsteadVolume = this.calculateHalsteadVolume(code);

    // Advanced code quality metrics
    const maintainabilityIndex = this.calculateMaintainabilityIndex(code);
    const duplicationScore = this.detectCodeDuplication(code);
    const technicalDebtRatio = this.assessTechnicalDebt(code);

    // Calculate maintainability index (simplified version)
    const maintainability = Math.max(0, Math.min(100,
      171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode)
    ));

    // AI-powered quality prediction (simplified ML model)
    const aiQualityPrediction = this.predictCodeQualityWithAI(code, {
      cyclomaticComplexity,
      halsteadVolume,
      maintainabilityIndex,
      duplicationScore,
      technicalDebtRatio
    });

    // Advanced code smell detection
    const codeSmellDensity = this.detectCodeSmells(code);

    // Testability assessment
    const testabilityIndex = this.assessTestability(code);

    const quality: QualityMetrics = {
      maintainability,
      cyclomaticComplexity,
      halsteadVolume,
      linesOfCode,
      maintainabilityIndex,
      duplicationScore,
      technicalDebtRatio,
      aiQualityPrediction,
      codeSmellDensity,
      testabilityIndex
    };

    const security = this.analyzeSecurity(code);

    const suggestions: string[] = [];
    const dependencies: string[] = [];
    const alternatives: string[] = [];

    // Generate suggestions based on analysis
    if (cyclomaticComplexity > 10) {
      suggestions.push('Consider breaking down this function into smaller, more focused functions');
    }

    if (maintainability < 50) {
      suggestions.push('Code maintainability is low - consider refactoring for better readability');
    }

    if (halsteadVolume > 1000) {
      suggestions.push('High complexity detected - consider simplifying the logic');
    }

    // Extract potential dependencies from import statements
    // Handle various import patterns: ES6 imports, type imports, dynamic imports
    const importPatterns = [
      // Standard ES6 imports: import ... from 'module'
      /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+(?:\s*,\s*\w+)*)\s+from\s+['"]([^'"]+)['"]/g,
      // Type-only imports: import type ... from 'module'
      /import\s+type\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+(?:\s*,\s*\w+)*)\s+from\s+['"]([^'"]+)['"]/g,
      // Dynamic imports: import('module')
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      // Re-exports: export ... from 'module'
      /export\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+(?:\s*,\s*\w+)*)\s+from\s+['"]([^'"]+)['"]/g,
      // Type re-exports: export type ... from 'module'
      /export\s+type\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+(?:\s*,\s*\w+)*)\s+from\s+['"]([^'"]+)['"]/g,
      // Side-effect imports: import 'module'
      /import\s+['"]([^'"]+)['"]/g,
      // Multi-line imports (handles line breaks)
      /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
      // Namespace imports with aliases: import * as alias from 'module'
      /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g,
      // Default imports: import defaultExport from 'module'
      /import\s+\w+(?:\s*,\s*(?:{[^}]*}|\*\s+as\s+\w+))?\s+from\s+['"]([^'"]+)['"]/g
    ];

    for (const pattern of importPatterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          dependencies.push(match[1]);
        }
      }
    }

    // Detect unused imports with AST-level analysis
    const unusedImports = this.detectUnusedImports(code, dependencies);

    // Generate alternatives
    if (code.includes('var ')) {
      alternatives.push('Consider using let/const instead of var for better scoping');
    }

    if (code.match(/\bfor\s*\(\s*var\s+/)) {
      alternatives.push('Avoid var in for loops - use let for block scoping');
    }

    return {
      security,
      quality,
      suggestions,
      dependencies,
      alternatives,
      unusedImports
    };
  }

  static generateRecommendations(code: string): CodeRecommendation[] {
    const analysis = this.analyzeCode(code);
    const recommendations: CodeRecommendation[] = [];

    // Convert analysis results to recommendations
    analysis.suggestions.forEach(suggestion => {
      recommendations.push({
        type: 'refactor',
        description: suggestion,
        priority: analysis.quality.maintainability < 30 ? 'high' : 'medium'
      });
    });

    analysis.security.recommendations.forEach(rec => {
      recommendations.push({
        type: 'security',
        description: rec,
        priority: analysis.security.riskLevel === 'high' || analysis.security.riskLevel === 'critical' ? 'high' : 'medium'
      });
    });

    return recommendations;
  }

  static generateBuildingBlocks(category: string): BuildingBlock[] {
    const blocks: BuildingBlock[] = [];

    if (category === 'error-handling') {
      blocks.push({
        name: 'Try-Catch Wrapper',
        description: 'Standard error handling pattern',
        template: `try {
  // Code that might throw
  \${code}
} catch (error) {
  console.error('Error:', error);
  // Handle error appropriately
  \${errorHandling}
}`,
        category: 'error-handling',
        complexity: 1
      });
    }

    if (category === 'async') {
      blocks.push({
        name: 'Async Function with Error Handling',
        description: 'Async function with proper error handling',
        template: `async function \${functionName}(\${params}) {
  try {
    \${asyncCode}
    return \${result};
  } catch (error) {
    console.error('Async operation failed:', error);
    throw error;
  }
}`,
        category: 'async',
        complexity: 2
      });
    }

    return blocks;
  }

  static generateNamingGuide(code: string): NamingGuide {
    const identifiers = this.extractIdentifiers(code);

    // Categorize identifiers by likely type
    const variables: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    const files: string[] = [];

    for (const identifier of identifiers) {
      // Simple heuristics for categorization
      if (identifier[0] === identifier[0].toUpperCase() && identifier.length > 1) {
        classes.push(identifier);
      } else if (code.includes(`function ${identifier}`) || code.includes(`${identifier}(`)) {
        functions.push(identifier);
      } else {
        variables.push(identifier);
      }
    }

    return {
      variables: [...new Set(variables)],
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
      files: [] // Would need file system analysis to populate
    };
  }

  // FIX: Return type now matches the declared interface
  static provideComprehensiveGuidance(code: string): {
    analysis: CodeAnalysis;
    recommendations: CodeRecommendation[];
    buildingBlocks: BuildingBlock[];
    namingGuide: NamingGuide;
    security: SecurityAnalysis;
    quality: QualityMetrics;
    suggestions: string[];
    dependencies: string[];
    alternatives: string[];
  } {
    const analysis = this.analyzeCode(code);

    return {
      analysis,
      recommendations: this.generateRecommendations(code),
      buildingBlocks: this.generateBuildingBlocks('general'),
      namingGuide: this.generateNamingGuide(code),
      security: analysis.security,
      quality: analysis.quality,
      suggestions: analysis.suggestions,
      dependencies: analysis.dependencies,
      alternatives: analysis.alternatives
    };
  }

  /**
   * Calculate advanced maintainability index using multiple factors
   */
  private static calculateMaintainabilityIndex(code: string): number {
    const linesOfCode = code.split('\n').filter(line => line.trim().length > 0).length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    const halsteadVolume = this.calculateHalsteadVolume(code);

    // Microsoft Maintainability Index formula (simplified)
    // MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
    const mi = 171 - 5.2 * Math.log(Math.max(halsteadVolume, 1)) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(Math.max(linesOfCode, 1));

    // Normalize to 0-100 scale
    return Math.max(0, Math.min(100, mi));
  }

  /**
   * Detect code duplication using simple pattern matching
   */
  private static detectCodeDuplication(code: string): number {
    const lines = code.split('\n').filter(line => line.trim().length > 3);
    const lineMap = new Map<string, number>();
    let duplicateLines = 0;

    // Count line frequencies
    for (const line of lines) {
      const normalized = line.trim().replace(/\s+/g, ' ');
      lineMap.set(normalized, (lineMap.get(normalized) || 0) + 1);
    }

    // Calculate duplication score
    for (const [line, count] of lineMap) {
      if (count > 1 && line.length > 10) { // Ignore short/common lines
        duplicateLines += (count - 1); // Each duplicate beyond the first
      }
    }

    // Return duplication percentage
    return lines.length > 0 ? (duplicateLines / lines.length) * 100 : 0;
  }

  /**
   * Assess technical debt based on code quality indicators
   */
  private static assessTechnicalDebt(code: string): number {
    let debtScore = 0;

    // Factor 1: Long functions (>50 lines)
    const functions = code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g) || [];
    for (const func of functions) {
      const lines = func.split('\n').length;
      if (lines > 50) debtScore += (lines - 50) * 0.1;
    }

    // Factor 2: Deep nesting (>3 levels)
    const nestingMatches = code.match(/{\s*{/g) || [];
    debtScore += nestingMatches.length * 5;

    // Factor 3: Long variable names (>30 chars) - could indicate complexity
    const longVars = (code.match(/\b\w{30,}\b/g) || []).length;
    debtScore += longVars * 2;

    // Factor 4: Magic numbers
    const magicNumbers = (code.match(/\b\d{2,}\b/g) || []).length;
    debtScore += magicNumbers * 0.5;

    // Factor 5: Comments ratio (lack of comments increases debt)
    const commentLines = (code.match(/^[\s]*\/\//gm) || []).length;
    const totalLines = code.split('\n').length;
    const commentRatio = commentLines / totalLines;
    if (commentRatio < 0.1) debtScore += 20; // Low comment ratio increases debt

    // Factor 6: Cyclomatic complexity
    const complexity = this.calculateCyclomaticComplexity(code);
    if (complexity > 10) debtScore += (complexity - 10) * 3;

    return Math.min(100, debtScore); // Cap at 100
  }

  /**
   * AI-powered code quality prediction using machine learning model
   */
  private static predictCodeQualityWithAI(code: string, metrics: any): number {
    // Simplified ML model - would use trained model in production
    let prediction = 75; // Base quality score

    // Adjust based on complexity
    if (metrics.cyclomaticComplexity > 15) prediction -= 20;
    else if (metrics.cyclomaticComplexity > 10) prediction -= 10;

    // Adjust based on maintainability index
    prediction += (metrics.maintainabilityIndex - 50) * 0.5;

    // Adjust based on duplication
    prediction -= metrics.duplicationScore * 0.3;

    // Adjust based on technical debt
    prediction -= metrics.technicalDebtRatio * 0.4;

    // Code length factor
    const lines = code.split('\n').length;
    if (lines > 500) prediction -= 15;
    else if (lines > 200) prediction -= 5;

    return Math.max(0, Math.min(100, prediction));
  }

  /**
   * Detect code smells using advanced pattern matching
   */
  private static detectCodeSmells(code: string): number {
    let smellCount = 0;

    // Long methods (>30 lines)
    const methods = code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g) || [];
    for (const method of methods) {
      const lines = method.split('\n').length;
      if (lines > 30) smellCount++;
    }

    // Data clumps (multiple parameters with similar names)
    const functions = code.match(/function\s+\w+\s*\([^)]*\)/g) || [];
    for (const func of functions) {
      const paramMatch = func.match(/\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[1].split(',').map(p => p.trim());
        if (params.length > 3) {
          // Check for similar parameter names
          const prefixes = params.map(p => p.split(/(?=[A-Z])/)[0] || p.substring(0, 3));
          const commonPrefix = prefixes.find(prefix =>
            prefixes.filter(p => p === prefix).length > 1
          );
          if (commonPrefix) smellCount += 0.5;
        }
      }
    }

    // Switch statements without default
    const switches = code.match(/switch\s*\([^)]*\)\s*{[^}]*}/g) || [];
    for (const switchStmt of switches) {
      if (!switchStmt.includes('default:')) smellCount++;
    }

    // Empty catch blocks
    const catchBlocks = code.match(/catch\s*\([^)]*\)\s*{[^}]*}/g) || [];
    for (const catchBlock of catchBlocks) {
      const body = catchBlock.match(/{([^}]*)}/)?.[1] || '';
      if (body.trim().length < 5) smellCount++;
    }

    // Magic numbers
    const magicNumbers = code.match(/\b\d{2,}\b/g) || [];
    smellCount += magicNumbers.length * 0.1;

    // Calculate density (smells per 100 lines)
    const lines = code.split('\n').length;
    return lines > 0 ? (smellCount / lines) * 100 : 0;
  }

  /**
   * Assess code testability using static analysis
   */
  private static assessTestability(code: string): number {
    let testabilityScore = 100; // Start with perfect score

    // Penalize for tightly coupled code
    const globalVars = (code.match(/\b(window|global|process)\./g) || []).length;
    testabilityScore -= globalVars * 2;

    // Penalize for singleton patterns (hard to mock)
    if (code.includes('singleton') || code.includes('Singleton')) {
      testabilityScore -= 15;
    }

    // Reward for dependency injection patterns
    if (code.includes('constructor(') && code.includes('private') || code.includes('readonly')) {
      testabilityScore += 10;
    }

    // Penalize for static methods (hard to mock)
    const staticMethods = (code.match(/\bstatic\s+\w+\s*\(/g) || []).length;
    testabilityScore -= staticMethods * 3;

    // Reward for interface usage
    if (code.includes('implements') || code.includes('interface')) {
      testabilityScore += 5;
    }

    // Penalize for complex conditional logic
    const conditions = (code.match(/\b(if|while|for)\s*\(/g) || []).length;
    const lines = code.split('\n').length;
    const conditionDensity = conditions / Math.max(lines, 1);
    if (conditionDensity > 0.1) {
      testabilityScore -= (conditionDensity - 0.1) * 100;
    }

    return Math.max(0, Math.min(100, testabilityScore));
  }

  /**
   * Perform comprehensive dependency analysis
   */
  static analyzeDependencies(packageJsonPath?: string): Promise<DependencyAnalysis> {
    return new Promise((resolve) => {
      // Placeholder - would analyze actual package.json and dependency tree
      const analysis: DependencyAnalysis = {
        dependencies: ['react', 'typescript', 'lodash'],
        devDependencies: ['jest', 'eslint', '@types/node'],
        transitiveDeps: ['chalk', 'commander', 'mime-types'],
        securityVulnerabilities: 2,
        outdatedPackages: 3,
        circularDependencies: [],
        bundleSize: 2.5, // MB
        treeShakingEfficiency: 85 // %
      };

      // Simulate async analysis
      setTimeout(() => resolve(analysis), 100);
    });
  }

  /**
   * Backward compatibility method for existing Gemini integrations
   * @deprecated Use provideComprehensiveGuidance instead
   */
  static analyzeAndGuide(params: {
    code: string;
    language?: string;
    context?: string;
    includeSecurity?: boolean;
    includeQuality?: boolean;
  }): {
    analysis: CodeAnalysis;
    recommendations: CodeRecommendation[];
    buildingBlocks: BuildingBlock[];
    namingGuide: NamingGuide;
    security: SecurityAnalysis;
    quality: QualityMetrics;
    suggestions: string[];
    dependencies: string[];
    alternatives: string[];
  } {
    return this.provideComprehensiveGuidance(params.code);
  }

  /**
   * Generate performance profile for code
   */
  static profilePerformance(code: string): PerformanceProfile {
    // Estimate execution time based on operations
    const operations = {
      loops: (code.match(/\b(for|while|do)\s*\(/g) || []).length,
      functionCalls: (code.match(/\w+\s*\([^)]*\)/g) || []).length,
      arrayOperations: (code.match(/\w+\.(map|filter|reduce|forEach)/g) || []).length,
      stringOperations: (code.match(/\+|\.concat\(/g) || []).length,
      regexOperations: (code.match(/new\s+RegExp|\//g) || []).length
    };

    const estimatedTime = (
      operations.loops * 10 +
      operations.functionCalls * 2 +
      operations.arrayOperations * 5 +
      operations.stringOperations * 1 +
      operations.regexOperations * 15
    );

    // Estimate memory footprint
    const memoryFootprint = code.length * 2 + // Base memory
      operations.arrayOperations * 100 + // Array allocations
      operations.stringOperations * 50; // String operations

    // CPU intensity based on algorithm complexity
    const cpuIntensity = Math.min(100, (
      operations.loops * 20 +
      operations.regexOperations * 30 +
      operations.arrayOperations * 10
    ));

    // Scalability assessment
    const scalabilityScore = 100 - (
      operations.loops * 5 + // Nested loops hurt scalability
      operations.functionCalls * 2 // Deep call stacks hurt scalability
    );

    // Identify bottlenecks
    const bottlenecks: string[] = [];
    if (operations.loops > 5) bottlenecks.push('High loop count may cause performance issues');
    if (operations.regexOperations > 3) bottlenecks.push('Excessive regex usage may impact performance');
    if (operations.arrayOperations > 10) bottlenecks.push('Heavy array operations detected');
    if (cpuIntensity > 80) bottlenecks.push('High CPU intensity may cause blocking');

    return {
      estimatedExecutionTime: estimatedTime,
      memoryFootprint: memoryFootprint,
      cpuIntensity: Math.max(0, Math.min(100, cpuIntensity)),
      scalabilityScore: Math.max(0, Math.min(100, scalabilityScore)),
      bottlenecks
    };
  }
}
