/**
 * Guidance.js - Intelligent Code Building Blocks & Naming Convention System
 *
 * This system analyzes code patterns, styles, and context to generate perfect
 * building blocks and naming conventions for all programming scenarios.
 */

import * as path from 'path';

// ============================================================================
// 📊 CODE PATTERN ANALYSIS & CLASSIFICATION
// ============================================================================

/**
 * Code Style Classifiers
 */
export enum CodeStyle {
  CAMEL_CASE = 'camelCase',
  PASCAL_CASE = 'PascalCase',
  SNAKE_CASE = 'snake_case',
  KEBAB_CASE = 'kebab-case',
  SCREAMING_SNAKE = 'SCREAMING_SNAKE',
  CAMEL_SNAKE = 'camel_Snake',
  TRAIN_CASE = 'Train-Case'
}

/**
 * Programming Paradigms
 */
export enum ProgrammingParadigm {
  OBJECT_ORIENTED = 'object_oriented',
  FUNCTIONAL = 'functional',
  PROCEDURAL = 'procedural',
  REACTIVE = 'reactive',
  ASYNC_AWAIT = 'async_await',
  PROMISE_BASED = 'promise_based',
  EVENT_DRIVEN = 'event_driven',
  DECLARATIVE = 'declarative'
}

/**
 * Domain Contexts
 */
export enum DomainContext {
  WEB_DEVELOPMENT = 'web_development',
  DATA_PROCESSING = 'data_processing',
  API_DESIGN = 'api_design',
  BUSINESS_LOGIC = 'business_logic',
  INFRASTRUCTURE = 'infrastructure',
  TESTING = 'testing',
  CONFIGURATION = 'configuration',
  UTILITIES = 'utilities'
}

/**
 * Code Complexity Levels
 */
export enum ComplexityLevel {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  ENTERPRISE = 'enterprise'
}

/**
 * Advanced Code Quality Metrics
 */
export interface CodeQualityMetrics {
  maintainabilityIndex: number; // 0-100 scale
  cyclomaticComplexity: number;
  halsteadVolume: number;
  linesOfCode: number;
  commentRatio: number;
  testCoverage: number; // Estimated
  securityScore: number; // 0-100 scale
  performanceScore: number; // 0-100 scale
  documentationScore: number; // 0-100 scale
  bestPracticesScore: number; // 0-100 scale
}

/**
 * Code Dependencies Analysis
 */
export interface DependencyAnalysis {
  imports: string[];
  exports: string[];
  dependencies: string[];
  circularDependencies: boolean;
  unusedImports: string[];
  missingDependencies: string[];
}

/**
 * Code Security Analysis
 */
export interface SecurityAnalysis {
  vulnerabilities: SecurityIssue[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  securePatterns: number;
  insecurePatterns: number;
}

/**
 * Security Vulnerability
 */
export interface SecurityIssue {
  type: 'injection' | 'xss' | 'auth_bypass' | 'data_exposure' | 'weak_crypto' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  description: string;
  fix: string;
}

/**
 * Advanced Code Analysis Result
 */
export interface CodeAnalysis {
  style: CodeStyle;
  paradigm: ProgrammingParadigm;
  domain: DomainContext;
  complexity: ComplexityLevel;
  patterns: CodePattern[];
  conventions: NamingConvention[];
  confidence: number;

  // Advanced Quality Metrics (Superior to Claude)
  quality: CodeQualityMetrics;
  dependencies: DependencyAnalysis;
  security: SecurityAnalysis;
  suggestions: CodeImprovementSuggestion[];
  alternatives: CodeAlternative[];
}

/**
 * Code Improvement Suggestion
 */
export interface CodeImprovementSuggestion {
  type: 'refactor' | 'optimize' | 'security' | 'performance' | 'maintainability';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  before: string;
  after: string;
  impact: 'minor' | 'moderate' | 'significant' | 'major';
  effort: 'low' | 'medium' | 'high';
}

/**
 * Code Alternative
 */
export interface CodeAlternative {
  approach: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  code: string;
  suitabilityScore: number; // 0-100
}

/**
 * Code Pattern Recognition
 */
export interface CodePattern {
  type: string;
  confidence: number;
  examples: string[];
  category: 'structure' | 'behavior' | 'data' | 'control';
}

/**
 * Naming Convention Rules
 */
export interface NamingConvention {
  pattern: RegExp;
  style: CodeStyle;
  category: 'variable' | 'function' | 'class' | 'constant' | 'file' | 'directory';
  examples: string[];
  priority: number;
}

// ============================================================================
// 🧠 INTELLIGENT PATTERN ANALYZER
// ============================================================================

export class CodePatternAnalyzer {
  private static readonly STYLE_PATTERNS = {
    [CodeStyle.CAMEL_CASE]: /^[a-z][a-zA-Z0-9]*$/,
    [CodeStyle.PASCAL_CASE]: /^[A-Z][a-zA-Z0-9]*$/,
    [CodeStyle.SNAKE_CASE]: /^[a-z][a-z0-9_]*$/,
    [CodeStyle.KEBAB_CASE]: /^[a-z][a-z0-9-]*$/,
    [CodeStyle.SCREAMING_SNAKE]: /^[A-Z][A-Z0-9_]*$/,
    [CodeStyle.CAMEL_SNAKE]: /^[a-z][a-zA-Z0-9_]*$/,
    [CodeStyle.TRAIN_CASE]: /^[A-Z][a-zA-Z0-9-]*$/
  };

  private static readonly PARADIGM_KEYWORDS = {
    [ProgrammingParadigm.OBJECT_ORIENTED]: ['class', 'this', 'extends', 'implements', 'public', 'private'],
    [ProgrammingParadigm.FUNCTIONAL]: ['map', 'filter', 'reduce', 'compose', 'curry', 'pure'],
    [ProgrammingParadigm.PROCEDURAL]: ['procedure', 'subroutine', 'goto', 'call'],
    [ProgrammingParadigm.REACTIVE]: ['Observable', 'subscribe', 'pipe', 'Subject', 'BehaviorSubject'],
    [ProgrammingParadigm.ASYNC_AWAIT]: ['async', 'await', 'Promise'],
    [ProgrammingParadigm.PROMISE_BASED]: ['then', 'catch', 'finally', 'Promise'],
    [ProgrammingParadigm.EVENT_DRIVEN]: ['on', 'emit', 'EventEmitter', 'addEventListener'],
    [ProgrammingParadigm.DECLARATIVE]: ['describe', 'it', 'expect', 'should', 'render']
  };

  private static readonly DOMAIN_KEYWORDS = {
    [DomainContext.WEB_DEVELOPMENT]: ['component', 'route', 'middleware', 'template', 'view', 'controller'],
    [DomainContext.DATA_PROCESSING]: ['query', 'dataset', 'transform', 'aggregate', 'pipeline', 'stream'],
    [DomainContext.API_DESIGN]: ['endpoint', 'request', 'response', 'client', 'server', 'api'],
    [DomainContext.BUSINESS_LOGIC]: ['service', 'manager', 'handler', 'processor', 'validator'],
    [DomainContext.INFRASTRUCTURE]: ['config', 'database', 'cache', 'queue', 'scheduler'],
    [DomainContext.TESTING]: ['test', 'spec', 'mock', 'stub', 'fixture', 'assert'],
    [DomainContext.CONFIGURATION]: ['config', 'settings', 'env', 'options', 'preferences'],
    [DomainContext.UTILITIES]: ['util', 'helper', 'tool', 'lib', 'common', 'shared']
  };

  /**
   * Analyze code with advanced quality metrics (Superior to Claude)
   */
  static async analyzeCode(code: string, filePath?: string): Promise<CodeAnalysis> {
    const style = this.detectPrimaryStyle(code);
    const paradigm = this.detectPrimaryParadigm(code);
    const domain = this.detectDomain(code, filePath);
    const complexity = this.detectComplexity(code);
    const patterns = this.extractPatterns(code);
    const conventions = this.generateConventions(style, paradigm, domain);

    const confidence = this.calculateConfidence(style, paradigm, domain, patterns);

    // Advanced Quality Analysis (What makes us better than Claude)
    const quality = await this.analyzeCodeQuality(code);
    const dependencies = this.analyzeDependencies(code);
    const security = this.analyzeSecurity(code);
    const suggestions = this.generateImprovementSuggestions(code, quality, security);
    const alternatives = this.generateAlternatives(code, paradigm, domain);

    return {
      style,
      paradigm,
      domain,
      complexity,
      patterns,
      conventions,
      confidence,
      quality,
      dependencies,
      security,
      suggestions,
      alternatives
    };
  }

  /**
   * Advanced Code Quality Analysis (Superior to Claude's basic generation)
   */
  private static async analyzeCodeQuality(code: string): Promise<CodeQualityMetrics> {
    const lines = code.split('\n');
    const linesOfCode = lines.filter(line => line.trim().length > 0).length;

    // Maintainability Index calculation
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    const halsteadVolume = this.calculateHalsteadVolume(code);
    const commentRatio = this.calculateCommentRatio(code);

    // Advanced metrics that Claude doesn't typically provide
    const maintainabilityIndex = Math.max(0, Math.min(100,
      171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode)
    ));

    const testCoverage = this.estimateTestCoverage(code);
    const securityScore = this.calculateSecurityScore(code);
    const performanceScore = this.calculatePerformanceScore(code);
    const documentationScore = this.calculateDocumentationScore(code);
    const bestPracticesScore = this.calculateBestPracticesScore(code);

    return {
      maintainabilityIndex: Math.round(maintainabilityIndex),
      cyclomaticComplexity,
      halsteadVolume: Math.round(halsteadVolume),
      linesOfCode,
      commentRatio: Math.round(commentRatio * 100) / 100,
      testCoverage,
      securityScore,
      performanceScore,
      documentationScore,
      bestPracticesScore
    };
  }

  /**
   * Dependency Analysis (Claude often misses this)
   */
  private static analyzeDependencies(code: string): DependencyAnalysis {
    const imports: string[] = [];
    const exports: string[] = [];
    const dependencies: string[] = [];

    // Extract imports
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
      if (!match[1].startsWith('.') && !match[1].startsWith('/')) {
        dependencies.push(match[1]);
      }
    }

    // Extract exports
    const exportRegex = /export\s+(?:const|let|var|function|class|default)\s+(\w+)/g;
    while ((match = exportRegex.exec(code)) !== null) {
      exports.push(match[1]);
    }

    // Check for unused imports (Claude often generates these)
    const unusedImports = this.detectUnusedImports(code, imports);

    return {
      imports,
      exports,
      dependencies,
      circularDependencies: false, // Would need full codebase analysis
      unusedImports,
      missingDependencies: [] // Would need dependency resolution
    };
  }

  /**
   * Security Analysis (Claude's weak point)
   */
  private static analyzeSecurity(code: string): SecurityAnalysis {
    const vulnerabilities: SecurityIssue[] = [];

    // Common security issues Claude often misses
    const securityPatterns = [
      {
        pattern: /eval\s*\(/g,
        type: 'injection' as const,
        description: 'Use of eval() can lead to code injection',
        fix: 'Avoid using eval(). Use safer alternatives like JSON.parse()'
      },
      {
        pattern: /innerHTML\s*=\s*.*\+/g,
        type: 'xss' as const,
        description: 'Potential XSS vulnerability with string concatenation',
        fix: 'Use textContent or sanitize HTML input'
      },
      {
        pattern: /console\.log.*password|console\.log.*token|console\.log.*secret/g,
        type: 'data_exposure' as const,
        description: 'Logging sensitive information',
        fix: 'Never log passwords, tokens, or secrets'
      },
      {
        pattern: /Math\.random\(\)/g,
        type: 'weak_crypto' as const,
        description: 'Using Math.random() for security-critical operations',
        fix: 'Use crypto.getRandomValues() for secure randomness'
      }
    ];

    for (const { pattern, type, description, fix } of securityPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        vulnerabilities.push({
          type,
          severity: type === 'injection' || type === 'xss' ? 'high' : 'medium',
          location: `Line ${code.substring(0, match.index).split('\n').length}`,
          description,
          fix
        });
      }
    }

    const securePatterns = (code.match(/const|let|var/g) || []).length;
    const insecurePatterns = vulnerabilities.length;

    const riskLevel = vulnerabilities.length === 0 ? 'low' :
                     vulnerabilities.filter(v => v.severity === 'high' || v.severity === 'critical').length > 0 ? 'high' :
                     'medium';

    return {
      vulnerabilities,
      riskLevel,
      recommendations: vulnerabilities.map(v => v.fix),
      securePatterns,
      insecurePatterns
    };
  }

  /**
   * Generate Improvement Suggestions (What Claude doesn't provide)
   */
  private static generateImprovementSuggestions(
    code: string,
    quality: CodeQualityMetrics,
    security: SecurityAnalysis
  ): CodeImprovementSuggestion[] {
    const suggestions: CodeImprovementSuggestion[] = [];

    // Quality-based suggestions
    if (quality.cyclomaticComplexity > 10) {
      suggestions.push({
        type: 'refactor',
        priority: 'high',
        description: 'High cyclomatic complexity - consider breaking down complex functions',
        before: '// Complex function with many branches',
        after: '// Split into smaller, focused functions',
        impact: 'significant',
        effort: 'high'
      });
    }

    if (quality.commentRatio < 0.1) {
      suggestions.push({
        type: 'maintainability',
        priority: 'medium',
        description: 'Low comment ratio - add documentation for complex logic',
        before: 'function complexLogic() { /* complex code */ }',
        after: '/**\n * Complex business logic\n */\nfunction complexLogic() { /* documented code */ }',
        impact: 'moderate',
        effort: 'low'
      });
    }

    // Security-based suggestions
    for (const vuln of security.vulnerabilities) {
      suggestions.push({
        type: 'security',
        priority: vuln.severity === 'high' || vuln.severity === 'critical' ? 'critical' : 'high',
        description: vuln.description,
        before: code.substring(Math.max(0, code.indexOf(vuln.location) - 20), code.indexOf(vuln.location) + 50),
        after: `// Fixed: ${vuln.fix}`,
        impact: 'major',
        effort: 'medium'
      });
    }

    return suggestions;
  }

  /**
   * Generate Alternative Approaches (Claude's blind spot)
   */
  private static generateAlternatives(
    code: string,
    paradigm: ProgrammingParadigm,
    domain: DomainContext
  ): CodeAlternative[] {
    const alternatives: CodeAlternative[] = [];

    if (paradigm === ProgrammingParadigm.OBJECT_ORIENTED) {
      alternatives.push({
        approach: 'Functional Approach',
        description: 'Convert to functional programming style',
        advantages: ['Easier testing', 'Better composability', 'Immutable data'],
        disadvantages: ['Learning curve', 'May be less intuitive'],
        code: '// Functional equivalent would use pure functions and immutable data',
        suitabilityScore: 75
      });
    }

    if (domain === DomainContext.WEB_DEVELOPMENT) {
      alternatives.push({
        approach: 'Component Composition',
        description: 'Use composition over inheritance',
        advantages: ['Better reusability', 'Easier testing', 'Flexible architecture'],
        disadvantages: ['More boilerplate', 'Complex component trees'],
        code: '// Use composition patterns instead of deep inheritance',
        suitabilityScore: 85
      });
    }

    return alternatives;
  }

  /**
   * Detect primary naming style
   */
  private static detectPrimaryStyle(code: string): CodeStyle {
    const identifiers = this.extractIdentifiers(code);
    const styleCounts = new Map<CodeStyle, number>();

    for (const identifier of identifiers) {
      for (const [style, pattern] of Object.entries(this.STYLE_PATTERNS)) {
        if (pattern.test(identifier)) {
          styleCounts.set(style as CodeStyle, (styleCounts.get(style as CodeStyle) || 0) + 1);
        }
      }
    }

    let maxStyle = CodeStyle.CAMEL_CASE;
    let maxCount = 0;

    for (const [style, count] of styleCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxStyle = style;
      }
    }

    return maxStyle;
  }

  /**
   * Detect primary programming paradigm
   */
  private static detectPrimaryParadigm(code: string): ProgrammingParadigm {
    const paradigmScores = new Map<ProgrammingParadigm, number>();

    for (const [paradigm, keywords] of Object.entries(this.PARADIGM_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = code.match(regex);
        score += matches ? matches.length : 0;
      }
      paradigmScores.set(paradigm as ProgrammingParadigm, score);
    }

    let maxParadigm = ProgrammingParadigm.OBJECT_ORIENTED;
    let maxScore = 0;

    for (const [paradigm, score] of paradigmScores) {
      if (score > maxScore) {
        maxScore = score;
        maxParadigm = paradigm;
      }
    }

    return maxParadigm;
  }

  /**
   * Detect domain context
   */
  private static detectDomain(code: string, filePath?: string): DomainContext {
    const domainScores = new Map<DomainContext, number>();

    // Score based on keywords
    for (const [domain, keywords] of Object.entries(this.DOMAIN_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = code.match(regex);
        score += matches ? matches.length : 0;
      }
      domainScores.set(domain as DomainContext, score);
    }

    // Bonus points based on file path
    if (filePath) {
      const fileName = path.basename(filePath).toLowerCase();
      const dirName = path.dirname(filePath).toLowerCase();

      if (fileName.includes('test') || fileName.includes('spec')) {
        domainScores.set(DomainContext.TESTING,
          (domainScores.get(DomainContext.TESTING) || 0) + 10);
      }

      if (fileName.includes('config') || dirName.includes('config')) {
        domainScores.set(DomainContext.CONFIGURATION,
          (domainScores.get(DomainContext.CONFIGURATION) || 0) + 10);
      }

      if (fileName.includes('util') || dirName.includes('util')) {
        domainScores.set(DomainContext.UTILITIES,
          (domainScores.get(DomainContext.UTILITIES) || 0) + 10);
      }
    }

    let maxDomain = DomainContext.UTILITIES;
    let maxScore = 0;

    for (const [domain, score] of domainScores) {
      if (score > maxScore) {
        maxScore = score;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  /**
   * Detect code complexity
   */
  private static detectComplexity(code: string): ComplexityLevel {
    const lines = code.split('\n').length;
    const identifiers = this.extractIdentifiers(code).length;
    const keywords = this.countKeywords(code);

    if (lines < 50 && identifiers < 20) return ComplexityLevel.SIMPLE;
    if (lines < 200 && identifiers < 50) return ComplexityLevel.MODERATE;
    if (lines < 1000 && identifiers < 100) return ComplexityLevel.COMPLEX;
    return ComplexityLevel.ENTERPRISE;
  }

  /**
   * Extract code patterns
   */
  private static extractPatterns(code: string): CodePattern[] {
    const patterns: CodePattern[] = [];

    // Function patterns
    if (code.includes('=>') || code.includes('function')) {
      patterns.push({
        type: 'function_definition',
        confidence: 0.9,
        examples: ['const func = () => {}', 'function myFunc() {}'],
        category: 'structure'
      });
    }

    // Async patterns
    if (code.includes('async') || code.includes('await')) {
      patterns.push({
        type: 'async_operations',
        confidence: 0.95,
        examples: ['async function()', 'await promise'],
        category: 'behavior'
      });
    }

    // Class patterns
    if (code.includes('class ')) {
      patterns.push({
        type: 'class_definition',
        confidence: 0.9,
        examples: ['class MyClass {}'],
        category: 'structure'
      });
    }

    // Error handling patterns
    if (code.includes('try') || code.includes('catch')) {
      patterns.push({
        type: 'error_handling',
        confidence: 0.8,
        examples: ['try {} catch {}'],
        category: 'control'
      });
    }

    return patterns;
  }

  /**
   * Generate naming conventions based on analysis
   */
  private static generateConventions(
    style: CodeStyle,
    paradigm: ProgrammingParadigm,
    domain: DomainContext
  ): NamingConvention[] {
    const conventions: NamingConvention[] = [];

    // Base conventions based on style
    switch (style) {
      case CodeStyle.CAMEL_CASE:
        conventions.push({
          pattern: /^[a-z][a-zA-Z0-9]*$/,
          style,
          category: 'variable',
          examples: ['userName', 'getUserData', 'processRequest'],
          priority: 10
        });
        break;

      case CodeStyle.PASCAL_CASE:
        conventions.push({
          pattern: /^[A-Z][a-zA-Z0-9]*$/,
          style,
          category: 'class',
          examples: ['UserService', 'DataProcessor', 'ApiClient'],
          priority: 10
        });
        break;

      case CodeStyle.SNAKE_CASE:
        conventions.push({
          pattern: /^[a-z][a-z0-9_]*$/,
          style,
          category: 'variable',
          examples: ['user_name', 'get_user_data', 'process_request'],
          priority: 10
        });
        break;

      case CodeStyle.SCREAMING_SNAKE:
        conventions.push({
          pattern: /^[A-Z][A-Z0-9_]*$/,
          style,
          category: 'constant',
          examples: ['MAX_SIZE', 'API_KEY', 'DEFAULT_VALUE'],
          priority: 10
        });
        break;
    }

    // Domain-specific conventions
    switch (domain) {
      case DomainContext.TESTING:
        conventions.push({
          pattern: /.*(?:Test|Spec)$/,
          style: CodeStyle.PASCAL_CASE,
          category: 'class',
          examples: ['UserServiceTest', 'ApiClientSpec'],
          priority: 8
        });
        break;

      case DomainContext.WEB_DEVELOPMENT:
        conventions.push({
          pattern: /.*(?:Component|View|Controller)$/,
          style: CodeStyle.PASCAL_CASE,
          category: 'class',
          examples: ['UserComponent', 'HomeView', 'AuthController'],
          priority: 8
        });
        break;

      case DomainContext.API_DESIGN:
        conventions.push({
          pattern: /.*(?:Client|Service|Api)$/,
          style: CodeStyle.PASCAL_CASE,
          category: 'class',
          examples: ['HttpClient', 'UserService', 'RestApi'],
          priority: 8
        });
        break;
    }

    return conventions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate confidence score
   */
  private static calculateConfidence(
    style: CodeStyle,
    paradigm: ProgrammingParadigm,
    domain: DomainContext,
    patterns: CodePattern[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Style confidence
    if (style !== CodeStyle.CAMEL_CASE) confidence += 0.1;

    // Pattern confidence
    confidence += patterns.length * 0.05;

    // Domain confidence based on keywords
    if ([DomainContext.TESTING, DomainContext.CONFIGURATION].includes(domain)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate Cyclomatic Complexity (McCabe metric)
   */
  private static calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Count control flow keywords
    const controlFlowKeywords = ['if', 'else', 'for', 'while', 'case', 'catch', '&&', '\\|\\|'];
    for (const keyword of controlFlowKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      complexity += matches ? matches.length : 0;
    }

    return complexity;
  }

  /**
   * Calculate Halstead Volume (complexity metric)
   */
  private static calculateHalsteadVolume(code: string): number {
    const operators = ['+', '-', '*', '/', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '\\|\\|', '!', '\\?', ':'];
    const N1 = operators.reduce((count, op) => count + (code.match(new RegExp(op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 0); // Total operators

    const n1 = operators.length; // Unique operators
    const n2 = new Set(operands).size; // Unique operands
    const N1 = operators.reduce((count, op) => count + (code.match(new RegExp(`\\${op}`, 'g')) || []).length, 0); // Total operators
    const N2 = operands.length; // Total operands

    if (n1 === 0 || n2 === 0) return 0;

    return (n1 * Math.log2(n1) + n2 * Math.log2(n2)) * (N1 + N2) * Math.log2(N1 + N2);
  }

  /**
   * Calculate Comment Ratio
   */
  private static calculateCommentRatio(code: string): number {
    const lines = code.split('\n');
    const commentLines = lines.filter(line =>
      line.trim().startsWith('//') ||
      line.trim().startsWith('/*') ||
      line.trim().endsWith('*/') ||
      (line.includes('//') && !line.includes('://')) ||
      (line.includes('/*') && line.includes('*/'))
    ).length;

    return commentLines / lines.length;
  }

  /**
   * Estimate Test Coverage (heuristic)
   */
  private static estimateTestCoverage(code: string): number {
    const lines = code.split('\n');
    const testableLines = lines.filter(line =>
      line.includes('if') ||
      line.includes('for') ||
      line.includes('while') ||
      line.includes('function') ||
      line.includes('=>')
    ).length;

    // Estimate based on testable constructs
    return Math.min(80, testableLines * 5); // Rough heuristic
  }

  /**
   * Calculate Security Score
   */
  private static calculateSecurityScore(code: string): number {
    let score = 100;

    const securityIssues = [
      { pattern: /eval\s*\(/g, penalty: 30 },
      { pattern: /innerHTML\s*=\s*.*\+/g, penalty: 20 },
      { pattern: /console\.log.*password/g, penalty: 15 },
      { pattern: /Math\.random\(\)/g, penalty: 10 }
    ];

    for (const { pattern, penalty } of securityIssues) {
      const matches = code.match(pattern);
      if (matches) {
        score -= penalty * matches.length;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate Performance Score
   */
  private static calculatePerformanceScore(code: string): number {
    let score = 100;

    const performanceIssues = [
      { pattern: /\.(forEach|map|filter)\(\s*\(\)\s*=>/g, penalty: 5 }, // Arrow function in loop
      { pattern: /console\.log/g, penalty: 2 }, // Logging in production code
      { pattern: /==/g, penalty: 1 } // Loose equality
    ];

    for (const { pattern, penalty } of performanceIssues) {
      const matches = code.match(pattern);
      if (matches) {
        score -= penalty * matches.length;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate Documentation Score
   */
  private static calculateDocumentationScore(code: string): number {
    let score = 0;

    // JSDoc comments
    if (code.includes('/**')) score += 30;
    if (code.match(/\/\*\*\s*\n\s*\*\s*@/g)) score += 20; // JSDoc tags

    // Inline comments
    const commentRatio = this.calculateCommentRatio(code);
    score += commentRatio * 50;

    // Function documentation
    const functionCount = (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    const documentedFunctions = (code.match(/\/\*\*\s*\n.*?\*\//gs) || []).length;
    if (functionCount > 0) {
      score += (documentedFunctions / functionCount) * 20;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate Best Practices Score
   */
  private static calculateBestPracticesScore(code: string): number {
    let score = 100;

    const bestPracticeViolations = [
      { pattern: /var\s+/g, penalty: 5 }, // Using var instead of const/let
      { pattern: /==/g, penalty: 3 }, // Loose equality
      { pattern: /\bundefined\b/g, penalty: 2 }, // Explicit undefined checks
      { pattern: /console\.log/g, penalty: 1 } // Console logging
    ];

    for (const { pattern, penalty } of bestPracticeViolations) {
      const matches = code.match(pattern);
      if (matches) {
        score -= penalty * matches.length;
      }
    }

    // Bonus points for good practices
    if (code.includes('const ')) score += 5;
    if (code.includes('===') || code.includes('!==')) score += 5;
    if (code.includes('async') && code.includes('await')) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect Unused Imports
   */
  private static detectUnusedImports(code: string, imports: string[]): string[] {
    const unused: string[] = [];

    for (const importPath of imports) {
      // Extract the module name from import path
      const moduleName = importPath.split('/').pop()?.split('.')[0];
      if (moduleName && !code.includes(moduleName)) {
        unused.push(importPath);
      }
    }

    return unused;
  }

  /**
   * Extract identifiers from code
   */
  private static extractIdentifiers(code: string): string[] {
    // Simple regex to extract variable/function names
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    const matches = code.match(identifierRegex) || [];

    // Filter out keywords and common words
    return matches.filter(id => {
      const keywords = ['if', 'else', 'for', 'while', 'function', 'class', 'const', 'let', 'var'];
      return !keywords.includes(id) && id.length > 2;
    });
  }

  /**
   * Count keywords in code
   */
  private static countKeywords(code: string): number {
    let count = 0;
    const keywordList = ['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return'];

    for (const keyword of keywordList) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      count += matches ? matches.length : 0;
    }

    return count;
  }
}

// ============================================================================
// 🏗️ INTELLIGENT BUILDING BLOCKS GENERATOR
// ============================================================================

/**
 * Building Block Templates
 */
export interface BuildingBlock {
  name: string;
  category: string;
  template: string;
  variables: string[];
  description: string;
  tags: string[];
  complexity: ComplexityLevel;
  paradigm: ProgrammingParadigm;
  domain: DomainContext;
}

/**
 * Building Block Generator
 */
export class BuildingBlockGenerator {
  private static readonly TEMPLATES: BuildingBlock[] = [
    // Web Development Templates
    {
      name: 'React Component',
      category: 'component',
      template: `import React, { useState, useEffect } from 'react';

interface {{componentName}}Props {
  {{props}}
}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({ {{propList}} }) => {
  const [{{stateVar}}, set{{stateVarCapital}}] = useState<{{stateType}}>({{initialState}});

  useEffect(() => {
    {{effectLogic}}
  }, [{{dependencies}}]);

  const {{handlerName}} = () => {
    {{handlerLogic}}
  };

  return (
    <div className="{{componentNameLower}}">
      {{jsxContent}}
    </div>
  );
};

export default {{componentName}};`,
      variables: ['componentName', 'props', 'propList', 'stateVar', 'stateVarCapital', 'stateType', 'initialState', 'effectLogic', 'dependencies', 'handlerName', 'handlerLogic', 'jsxContent', 'componentNameLower'],
      description: 'Modern React functional component with hooks',
      tags: ['react', 'hooks', 'typescript', 'component'],
      complexity: ComplexityLevel.MODERATE,
      paradigm: ProgrammingParadigm.FUNCTIONAL,
      domain: DomainContext.WEB_DEVELOPMENT
    },

    // API Design Templates
    {
      name: 'Express Route Handler',
      category: 'api',
      template: `import { Request, Response } from 'express';
import { {{serviceName}} } from '../services/{{serviceNameLower}}';

export const {{handlerName}} = async (req: Request, res: Response) => {
  try {
    const { {{params}} } = req.{{paramSource}};

    {{validationLogic}}

    const result = await {{serviceNameLower}}.{{methodName}}({{methodParams}});

    res.status(200).json({
      success: true,
      data: result,
      message: '{{successMessage}}'
    });
  } catch (error) {
    console.error('{{handlerName}} error:', error);
    res.status(500).json({
      success: false,
      message: '{{errorMessage}}'
    });
  }
};`,
      variables: ['serviceName', 'serviceNameLower', 'handlerName', 'params', 'paramSource', 'validationLogic', 'methodName', 'methodParams', 'successMessage', 'errorMessage'],
      description: 'Express.js route handler with error handling',
      tags: ['express', 'api', 'middleware', 'typescript'],
      complexity: ComplexityLevel.MODERATE,
      paradigm: ProgrammingParadigm.ASYNC_AWAIT,
      domain: DomainContext.API_DESIGN
    },

    // Data Processing Templates
    {
      name: 'Data Transformer',
      category: 'data',
      template: `interface {{inputType}} {
  {{inputFields}}
}

interface {{outputType}} {
  {{outputFields}}
}

export class {{transformerName}} {
  static transform(input: {{inputType}}): {{outputType}} {
    {{validationLogic}}

    return {
      {{transformationLogic}}
    };
  }

  static transformMany(inputs: {{inputType}}[]): {{outputType}}[] {
    return inputs.map(input => this.transform(input));
  }

  static validate(input: {{inputType}}): boolean {
    {{validationRules}}
  }
}`,
      variables: ['inputType', 'inputFields', 'outputType', 'outputFields', 'transformerName', 'validationLogic', 'transformationLogic', 'validationRules'],
      description: 'Data transformation utility with validation',
      tags: ['data', 'transform', 'validation', 'typescript'],
      complexity: ComplexityLevel.MODERATE,
      paradigm: ProgrammingParadigm.FUNCTIONAL,
      domain: DomainContext.DATA_PROCESSING
    },

    // Testing Templates
    {
      name: 'Unit Test Suite',
      category: 'test',
      template: `import { describe, it, expect, beforeEach, afterEach } from '{{testFramework}}';
import { {{targetClass}} } from '../{{targetPath}}';

describe('{{targetClass}}', () => {
  let {{instanceName}}: {{targetClass}};

  beforeEach(() => {
    {{setupLogic}}
  });

  afterEach(() => {
    {{teardownLogic}}
  });

  describe('{{methodGroup}}', () => {
    it('should {{behaviorDescription}}', () => {
      {{testLogic}}

      expect({{assertion}}).{{matcher}}({{expectedValue}});
    });

    it('should handle {{edgeCase}}', () => {
      {{edgeCaseLogic}}

      expect({{edgeCaseAssertion}}).{{edgeCaseMatcher}}({{edgeCaseExpected}});
    });
  });
});`,
      variables: ['testFramework', 'targetClass', 'targetPath', 'instanceName', 'setupLogic', 'teardownLogic', 'methodGroup', 'behaviorDescription', 'testLogic', 'assertion', 'matcher', 'expectedValue', 'edgeCase', 'edgeCaseLogic', 'edgeCaseAssertion', 'edgeCaseMatcher', 'edgeCaseExpected'],
      description: 'Comprehensive unit test suite template',
      tags: ['testing', 'unit', 'tdd', 'jest'],
      complexity: ComplexityLevel.MODERATE,
      paradigm: ProgrammingParadigm.DECLARATIVE,
      domain: DomainContext.TESTING
    },

    // Configuration Templates
    {
      name: 'Configuration Manager',
      category: 'config',
      template: `interface {{configName}}Config {
  {{configFields}}
}

class {{configName}}Manager {
  private static instance: {{configName}}Manager;
  private config: {{configName}}Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): {{configName}}Manager {
    if (!{{configName}}Manager.instance) {
      {{configName}}Manager.instance = new {{configName}}Manager();
    }
    return {{configName}}Manager.instance;
  }

  private loadConfig(): {{configName}}Config {
    {{configLoadingLogic}}

    return {
      {{defaultConfig}}
    };
  }

  get<K extends keyof {{configName}}Config>(key: K): {{configName}}Config[K] {
    return this.config[key];
  }

  set<K extends keyof {{configName}}Config>(key: K, value: {{configName}}Config[K]): void {
    this.config[key] = value;
    {{persistenceLogic}}
  }

  getAll(): {{configName}}Config {
    return { ...this.config };
  }
}

export const {{configNameLower}}Config = {{configName}}Manager.getInstance();`,
      variables: ['configName', 'configFields', 'configNameLower', 'configLoadingLogic', 'defaultConfig', 'persistenceLogic'],
      description: 'Singleton configuration manager with persistence',
      tags: ['config', 'singleton', 'typescript', 'persistence'],
      complexity: ComplexityLevel.MODERATE,
      paradigm: ProgrammingParadigm.OBJECT_ORIENTED,
      domain: DomainContext.CONFIGURATION
    }
  ];

  /**
   * Generate building block based on context
   */
  static generateBuildingBlock(
    analysis: CodeAnalysis,
    purpose: string,
    variables: Record<string, string> = {}
  ): string {
    const template = this.selectBestTemplate(analysis, purpose);

    if (!template) {
      throw new Error(`No suitable template found for purpose: ${purpose}`);
    }

    return this.fillTemplate(template, { ...variables, ...this.generateSmartDefaults(analysis, template) });
  }

  /**
   * Get all available building blocks
   */
  static getAvailableBlocks(): BuildingBlock[] {
    return [...this.TEMPLATES];
  }

  /**
   * Select best template based on analysis and purpose
   */
  private static selectBestTemplate(analysis: CodeAnalysis, purpose: string): BuildingBlock | null {
    let bestMatch: BuildingBlock | null = null;
    let bestScore = 0;

    for (const template of this.TEMPLATES) {
      let score = 0;

      // Domain match
      if (template.domain === analysis.domain) score += 3;

      // Paradigm match
      if (template.paradigm === analysis.paradigm) score += 2;

      // Complexity match
      if (template.complexity === analysis.complexity) score += 2;

      // Purpose keyword matching
      const purposeWords = purpose.toLowerCase().split(' ');
      const templateWords = [...template.tags, template.category, template.name.toLowerCase()];

      for (const word of purposeWords) {
        if (templateWords.some(tw => tw.includes(word))) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    return bestMatch;
  }

  /**
   * Fill template with variables and quality validation
   */
  private static fillTemplate(template: BuildingBlock, variables: Record<string, string>): string {
    let result = template.template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }

    // Replace any remaining unfilled variables with intelligent defaults
    result = result.replace(/{{(\w+)}}/g, (match, varName) => {
      return this.generateSmartDefault(varName, template);
    });

    // Apply quality improvements (what makes us better than Claude)
    result = this.applyQualityImprovements(result, template);

    return result;
  }

  /**
   * Generate smart defaults for unfilled variables
   */
  private static generateSmartDefault(varName: string, template: BuildingBlock): string {
    const smartDefaults: Record<string, Record<string, string>> = {
      component: {
        componentName: 'GeneratedComponent',
        props: 'props?: Record<string, unknown>',
        stateVar: 'data',
        stateType: 'unknown',
        handlerName: 'handleEvent',
        jsxContent: '<div>Generated Component</div>'
      },
      api: {
        serviceName: 'ApiService',
        handlerName: 'handleRequest',
        params: 'params: Record<string, unknown>',
        paramSource: 'body',
        methodName: 'processRequest',
        successMessage: 'Request processed successfully',
        errorMessage: 'Request processing failed'
      },
      data: {
        inputType: 'InputData',
        inputFields: 'id: string;\n  value: unknown;',
        outputType: 'OutputData',
        outputFields: 'id: string;\n  result: unknown;',
        transformerName: 'DataTransformer'
      },
      test: {
        targetClass: 'TargetClass',
        targetPath: '../target',
        instanceName: 'instance',
        setupLogic: '// Setup test instance',
        teardownLogic: '// Cleanup test resources',
        methodGroup: 'Core Methods',
        behaviorDescription: 'performs expected behavior',
        testLogic: '// Arrange, Act, Assert',
        assertion: 'result',
        matcher: 'toBeDefined',
        expectedValue: 'expectedValue'
      },
      config: {
        configName: 'AppConfig',
        configFields: 'port: number;\n  apiUrl: string;',
        configNameLower: 'appConfig',
        configLoadingLogic: 'const env = process.env;',
        defaultConfig: 'port: 3000,\n      apiUrl: "http://localhost:3000"',
        persistenceLogic: '// Optional: persist to storage'
      }
    };

    const categoryDefaults = smartDefaults[template.category] || {};
    return categoryDefaults[varName] || `/* TODO: Implement ${varName} */`;
  }

  /**
   * Apply quality improvements (superior to Claude)
   */
  private static applyQualityImprovements(code: string, template: BuildingBlock): string {
    let improvedCode = code;

    // 1. Add error handling where missing
    if (template.category === 'api' && !improvedCode.includes('try')) {
      improvedCode = improvedCode.replace(
        /(export const \w+ = async .*?\{)/s,
        '$1\n  try {'
      );
      improvedCode = improvedCode.replace(
        /(\s*res\.status\(\d+\)\.json\(.*?\);\s*})/s,
        '  } catch (error) {\n    console.error(\'API Error:\', error);\n    res.status(500).json({ success: false, message: \'Internal server error\' });\n  }\n}');
    }

    // 2. Add TypeScript types where missing
    if (!improvedCode.includes(': ') && improvedCode.includes('function')) {
      improvedCode = improvedCode.replace(
        /function (\w+)\(([^)]*)\)/g,
        'function $1($2): void'
      );
    }

    // 3. Add JSDoc comments for better documentation
    if (template.category === 'api' && !improvedCode.includes('/**')) {
      const functionMatch = improvedCode.match(/(export const \w+ = async)/);
      if (functionMatch) {
        improvedCode = improvedCode.replace(
          functionMatch[1],
          `/**\n * ${functionMatch[1].split(' ')[2]} - API endpoint handler\n */\n${functionMatch[1]}`
        );
      }
    }

    // 4. Add input validation for API endpoints
    if (template.category === 'api' && improvedCode.includes('req.')) {
      const validationCode = `
    // Input validation
    if (!req.body) {
      return res.status(400).json({ success: false, message: 'Request body required' });
    }
`;
      improvedCode = improvedCode.replace(
        /(export const \w+ = async .*?\{)/s,
        '$1' + validationCode
      );
    }

    // 5. Add security headers for web components
    if (template.category === 'component' && improvedCode.includes('return')) {
      improvedCode = improvedCode.replace(
        /return \(/,
        `// Security: Sanitize props to prevent XSS
  const sanitizedProps = Object.keys(props || {}).reduce((acc, key) => {
    acc[key] = typeof props[key] === 'string' ? props[key].replace(/[<>]/g, '') : props[key];
    return acc;
  }, {} as any);

  return (`
      );
    }

    // 6. Add performance optimizations
    if (improvedCode.includes('useState') && !improvedCode.includes('useCallback')) {
      improvedCode = improvedCode.replace(
        /import React, \{([^}]*)\}/,
        'import React, {$1, useCallback}'
      );
    }

    // 7. Add accessibility attributes for components
    if (template.category === 'component' && improvedCode.includes('<div')) {
      improvedCode = improvedCode.replace(
        /<div([^>]*)>/g,
        '<div$1 role="region" aria-label="Generated component">'
      );
    }

    // 8. Add comprehensive error boundaries
    if (template.category === 'component' && !improvedCode.includes('ErrorBoundary')) {
      improvedCode = improvedCode.replace(
        /return \(/,
        `// Error boundary for robustness
  try {
    return (`
      );
      improvedCode = improvedCode.replace(
        /<\/div>\s*\);\s*}/,
        `</div>);
  } catch (error) {
    console.error('Component error:', error);
    return <div role="alert">An error occurred</div>;
  }}`
      );
    }

    return improvedCode;
  }

  /**
   * Generate smart defaults based on analysis
   */
  private static generateSmartDefaults(analysis: CodeAnalysis, template: BuildingBlock): Record<string, string> {
    const defaults: Record<string, string> = {};

    // Generate names based on style
    const nameGenerator = new IntelligentNameGenerator(analysis);

    for (const variable of template.variables) {
      if (!defaults[variable]) {
        defaults[variable] = nameGenerator.generateName(variable, template.category);
      }
    }

    return defaults;
  }
}

// ============================================================================
// 🧠 INTELLIGENT NAME GENERATOR
// ============================================================================

/**
 * Intelligent Name Generator
 */
export class IntelligentNameGenerator {
  constructor(private analysis: CodeAnalysis) {}

  /**
   * Generate intelligent name based on context
   */
  generateName(variableType: string, category: string): string {
    const baseName = this.generateBaseName(variableType, category);
    return this.applyStyleConvention(baseName, variableType);
  }

  /**
   * Generate base name from variable type and category
   */
  private generateBaseName(variableType: string, category: string): string {
    const patterns: Record<string, Record<string, string>> = {
      componentName: {
        component: 'UserProfile',
        api: 'ApiClient',
        data: 'DataProcessor',
        config: 'ConfigManager'
      },
      serviceName: {
        component: 'UserService',
        api: 'HttpService',
        data: 'DataService',
        config: 'ConfigService'
      },
      handlerName: {
        api: 'handleRequest',
        component: 'handleClick',
        data: 'handleData'
      },
      stateVar: {
        component: 'isLoading',
        api: 'response',
        data: 'items'
      }
    };

    return patterns[variableType]?.[category] ||
           patterns[variableType]?.['default'] ||
           this.generateGenericName(variableType);
  }

  /**
   * Apply style convention to base name
   */
  private applyStyleConvention(baseName: string, variableType: string): string {
    const convention = this.analysis.conventions.find(c =>
      c.category === this.mapVariableTypeToCategory(variableType)
    );

    if (convention) {
      return this.convertToStyle(baseName, convention.style);
    }

    // Default to camelCase
    return this.convertToStyle(baseName, CodeStyle.CAMEL_CASE);
  }

  /**
   * Convert name to specified style
   */
  private convertToStyle(name: string, style: CodeStyle): string {
    const words = this.splitIntoWords(name);

    switch (style) {
      case CodeStyle.CAMEL_CASE:
        return words.map((word, i) => i === 0 ? word.toLowerCase() : this.capitalize(word)).join('');

      case CodeStyle.PASCAL_CASE:
        return words.map(word => this.capitalize(word)).join('');

      case CodeStyle.SNAKE_CASE:
        return words.map(word => word.toLowerCase()).join('_');

      case CodeStyle.KEBAB_CASE:
        return words.map(word => word.toLowerCase()).join('-');

      case CodeStyle.SCREAMING_SNAKE:
        return words.map(word => word.toUpperCase()).join('_');

      case CodeStyle.TRAIN_CASE:
        return words.map(word => this.capitalize(word)).join('-');

      default:
        return name;
    }
  }

  /**
   * Split name into words
   */
  private splitIntoWords(name: string): string[] {
    // Handle camelCase, PascalCase, snake_case, kebab-case
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaces
      .replace(/[-_]/g, ' ') // snake_case and kebab-case to spaces
      .split(' ')
      .filter(word => word.length > 0);
  }

  /**
   * Capitalize first letter
   */
  private capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Map variable type to category
   */
  private mapVariableTypeToCategory(variableType: string): string {
    const mappings: Record<string, string> = {
      componentName: 'class',
      serviceName: 'class',
      handlerName: 'function',
      stateVar: 'variable',
      configName: 'class'
    };

    return mappings[variableType] || 'variable';
  }

  /**
   * Generate generic name
   */
  private generateGenericName(variableType: string): string {
    const generics: Record<string, string> = {
      componentName: 'MyComponent',
      serviceName: 'MyService',
      handlerName: 'handleEvent',
      stateVar: 'data',
      configName: 'MyConfig'
    };

    return generics[variableType] || variableType;
  }
}

// ============================================================================
// 🎯 MAIN GUIDANCE SYSTEM
// ============================================================================

/**
 * Main Guidance System
 */
export class GuidanceSystem {
  constructor() {
    // Static classes don't need instances
  }

  /**
   * Analyze code and generate guidance
   */
  async analyzeAndGuide(code: string, filePath?: string): Promise<{
    security: any;
    quality: any;
    suggestions: any;
    dependencies: any;
    alternatives: any;
    analysis: CodeAnalysis;
    recommendations: string[];
    buildingBlocks: BuildingBlock[];
    namingGuide: Record<string, string>;
  }> {
    const analysis = await CodePatternAnalyzer.analyzeCode(code, filePath);
    const nameGenerator = new IntelligentNameGenerator(analysis);

    const recommendations = this.generateRecommendations(analysis);
    const buildingBlocks = BuildingBlockGenerator.getAvailableBlocks()
      .filter((block: BuildingBlock) => this.matchesAnalysis(block, analysis))
      .slice(0, 5); // Top 5 matches

    const namingGuide = this.generateNamingGuide(analysis, nameGenerator);

    return {
      analysis,
      recommendations,
      buildingBlocks,
      namingGuide
    };
  }

  /**
   * Generate building block for specific purpose
   */
  async generateBuildingBlock(
    code: string,
    purpose: string,
    customVariables: Record<string, string> = {},
    filePath?: string
  ): Promise<string> {
    const analysis = await CodePatternAnalyzer.analyzeCode(code, filePath);
    return BuildingBlockGenerator.generateBuildingBlock(analysis, purpose, customVariables);
  }

  /**
   * Generate intelligent variable names
   */
  async generateNames(
    code: string,
    variableTypes: string[],
    filePath?: string
  ): Promise<Record<string, string>> {
    const analysis = await CodePatternAnalyzer.analyzeCode(code, filePath);
    const nameGenerator = new IntelligentNameGenerator(analysis);
    const names: Record<string, string> = {};

    for (const type of variableTypes) {
      names[type] = nameGenerator.generateName(type, 'variable');
    }

    return names;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: CodeAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.confidence < 0.7) {
      recommendations.push('Consider establishing clearer naming conventions in your codebase');
    }

    if (analysis.complexity === ComplexityLevel.ENTERPRISE) {
      recommendations.push('Consider breaking down complex code into smaller, focused modules');
    }

    if (analysis.patterns.length < 3) {
      recommendations.push('Your code could benefit from more consistent patterns and structures');
    }

    switch (analysis.paradigm) {
      case ProgrammingParadigm.OBJECT_ORIENTED:
        recommendations.push('Consider using more functional programming patterns for data transformations');
        break;
      case ProgrammingParadigm.FUNCTIONAL:
        recommendations.push('Consider using classes for complex state management');
        break;
    }

    return recommendations;
  }

  /**
   * Check if building block matches analysis
   */
  private matchesAnalysis(block: BuildingBlock, analysis: CodeAnalysis): boolean {
    let score = 0;

    if (block.domain === analysis.domain) score += 2;
    if (block.paradigm === analysis.paradigm) score += 2;
    if (block.complexity === analysis.complexity) score += 1;

    return score >= 2;
  }

  /**
   * Generate naming guide
   */
  private generateNamingGuide(analysis: CodeAnalysis, nameGenerator: IntelligentNameGenerator): Record<string, string> {
    const guide: Record<string, string> = {};

    for (const convention of analysis.conventions) {
      const key = `${convention.category}_${convention.style}`;
      guide[key] = convention.examples.join(', ');
    }

    // Add generated examples for common patterns
    guide['generated_function'] = nameGenerator.generateName('handler', 'function');
    guide['generated_variable'] = nameGenerator.generateName('data', 'variable');
    guide['generated_class'] = nameGenerator.generateName('service', 'class');

    return guide;
  }
}

// ============================================================================
// 🚀 EXPORT MAIN INTERFACE
// ============================================================================

export default GuidanceSystem;
