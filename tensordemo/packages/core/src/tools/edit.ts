/**
 * Enhanced Edit Tool with Safe Replacements & Conflict Resolution
 *
 * This tool provides advanced file editing capabilities with:
 * - Safe string replacement with $ sequence handling
 * - Virtual File System integration
 * - Enhanced debugging and error reporting
 * - Comprehensive validation and conflict resolution
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VirtualFileSystem } from '../services/fileSystemService.js';

interface EditOperation {
  filePath: string;
  oldString: string;
  newString: string;
  description?: string;
  options?: EditOptions;
}

interface EditOptions {
  dryRun?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  backup?: boolean;
  validateSyntax?: boolean;
  maxOccurrences?: number;
  semanticMatching?: boolean;
  aiAnalysis?: boolean;
  preserveFormatting?: boolean;
  intelligentConflicts?: boolean;
  autoRefactor?: boolean;
}

interface SemanticMatch {
  confidence: number;
  context: string;
  suggestions: string[];
  relatedChanges: EditOperation[];
}

interface AIInsight {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  alternatives: string[];
  impact: {
    performance: number;
    maintainability: number;
    security: number;
  };
}

interface EditResult {
  success: boolean;
  filePath: string;
  changes: number;
  warnings: string[];
  errors: string[];
  backupCreated?: string;
  semanticMatches?: SemanticMatch[];
  aiInsights?: AIInsight[];
  refactoringSuggestions?: EditOperation[];
  diff?: string;
}

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}

export class EnhancedEditTool {
  private vfs: VirtualFileSystem;
  private operationHistory: EditOperation[] = [];
  private maxHistorySize = 100;

  constructor(vfs?: VirtualFileSystem) {
    this.vfs = vfs || VirtualFileSystem.getInstance();
  }

  /**
   * Safely edit a file with comprehensive validation and conflict resolution
   * Supports advanced options like regex, dry-run, and syntax validation
   */
  async safeEdit(operation: EditOperation): Promise<EditResult> {
    const options = operation.options || {};
    const result: EditResult = {
      success: false,
      filePath: operation.filePath,
      changes: 0,
      warnings: [],
      errors: []
    };

    try {
      // Dry run mode - just validate and preview changes
      if (options.dryRun) {
        return await this.dryRunEdit(operation);
      }

      // Step 1: Validate the operation
      const validation = await this.validateEdit(operation);
      if (!validation.isValid) {
        result.errors.push(...validation.issues);
        return result;
      }

      // Add validation suggestions as warnings
      result.warnings.push(...validation.suggestions);

      // Step 2: Read current file content
      const currentContent = await this.vfs.readTextFile(operation.filePath);

      // Step 3: Perform AI-powered semantic analysis if enabled
      if (options.aiAnalysis || options.semanticMatching) {
        const semanticMatches = await this.performSemanticAnalysis(currentContent, operation.oldString, options, operation);
        result.semanticMatches = semanticMatches;

        const aiInsights = await this.generateAIInsights(operation, currentContent, currentContent);
        result.aiInsights = aiInsights;

        const refactoringSuggestions = await this.generateRefactoringSuggestions(operation, currentContent);
        result.refactoringSuggestions = refactoringSuggestions;
      }

      // Step 4: Find all occurrences with advanced pattern matching
      const occurrences = this.findAdvancedOccurrences(currentContent, operation.oldString, options);

      if (occurrences.length === 0) {
        result.errors.push(`String "${operation.oldString}" not found in ${operation.filePath}`);
        result.errors.push('Available debugging information:');
        result.errors.push(`- File exists: ${await this.fileExists(operation.filePath)}`);
        result.errors.push(`- File size: ${currentContent.length} characters`);
        result.errors.push(`- Contains substring: ${currentContent.includes(operation.oldString.substring(0, 10))}`);

        // Add AI suggestions for not found patterns
        if (options.aiAnalysis && result.semanticMatches && result.semanticMatches.length > 0) {
          result.errors.push('AI Suggestions:');
          result.semanticMatches.forEach(match => {
            result.errors.push(`- ${match.context}`);
            match.suggestions.forEach(suggestion => {
              result.errors.push(`  • ${suggestion}`);
            });
          });
        }

        // Provide suggestions for common issues
        const suggestions = this.generateSearchSuggestions(operation.oldString, currentContent);
        result.errors.push('Suggestions:', ...suggestions);

        return result;
      }

      // Step 4: Create backup before editing
      const backupPath = await this.createBackup(operation.filePath);
      if (backupPath) {
        result.backupCreated = backupPath;
      }

      // Step 5: Apply replacements with conflict resolution
      let newContent = currentContent;
      let changesMade = 0;

      // Process replacements in reverse order to maintain position accuracy
      for (let i = occurrences.length - 1; i >= 0; i--) {
        const occurrence = occurrences[i];
        const beforeContext = newContent.substring(Math.max(0, occurrence.start - 50), occurrence.start);
        const afterContext = newContent.substring(occurrence.end, Math.min(newContent.length, occurrence.end + 50));

        // Validate replacement won't break syntax
        const syntaxCheck = this.validateSyntaxReplacement(
          operation.oldString,
          operation.newString,
          beforeContext,
          afterContext
        );

        if (!syntaxCheck.isValid) {
          result.warnings.push(`Potential syntax issue at occurrence ${i + 1}: ${syntaxCheck.issue}`);
        }

        // Apply the replacement
        newContent = newContent.substring(0, occurrence.start) +
                    operation.newString +
                    newContent.substring(occurrence.end);
        changesMade++;
      }

      // Step 6: Validate final content
      const finalValidation = await this.validateFinalContent(operation.filePath, newContent);
      if (!finalValidation.isValid) {
        result.errors.push('Final content validation failed:', ...finalValidation.issues);
        // Restore from backup if available
        if (result.backupCreated) {
          await this.restoreFromBackup(operation.filePath, result.backupCreated);
          result.warnings.push('Content restored from backup due to validation failure');
        }
        return result;
      }

      // Step 7: Write the new content
      await this.vfs.writeTextFile(operation.filePath, newContent);

      // Step 8: Record operation in history
      this.recordOperation(operation);

      result.success = true;
      result.changes = changesMade;

      if (changesMade > 1) {
        result.warnings.push(`Multiple replacements made (${changesMade} occurrences). Verify all changes are correct.`);
      }

    } catch (error) {
      result.errors.push(`Edit operation failed: ${error.message}`);

      // Attempt to restore from backup on critical errors
      if (result.backupCreated) {
        try {
          await this.restoreFromBackup(operation.filePath, result.backupCreated);
          result.warnings.push('Content restored from backup due to error');
        } catch (restoreError) {
          result.errors.push(`Backup restoration also failed: ${restoreError.message}`);
        }
      }
    }

    return result;
  }

  /**
   * Validate an edit operation before execution
   */
  private async validateEdit(operation: EditOperation): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      issues: [],
      suggestions: []
    };

    // Check if file exists
    if (!(await this.fileExists(operation.filePath))) {
      result.isValid = false;
      result.issues.push(`File does not exist: ${operation.filePath}`);
      return result;
    }

    // Validate file path
    if (!this.isValidFilePath(operation.filePath)) {
      result.isValid = false;
      result.issues.push(`Invalid file path: ${operation.filePath}`);
      return result;
    }

    // Check string lengths
    if (!operation.oldString || operation.oldString.length === 0) {
      result.isValid = false;
      result.issues.push('Old string cannot be empty');
      return result;
    }

    // Check for potentially problematic patterns
    const issues = this.analyzeString(operation.oldString, operation.newString);
    result.issues.push(...issues.critical);
    result.suggestions.push(...issues.warnings);

    if (issues.critical.length > 0) {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Analyze code semantically for intelligent matching and suggestions
   */
  private async performSemanticAnalysis(code: string, pattern: string, options: EditOptions, operation: EditOperation): Promise<SemanticMatch[]> {
    const matches: SemanticMatch[] = [];

    if (!options.semanticMatching) {
      return matches;
    }

    // Advanced semantic analysis (placeholder for ML/AI integration)
    const astAnalysis = this.analyzeAbstractSyntaxTree(code);
    const contextAnalysis = this.analyzeCodeContext(code, pattern);

    // Generate semantic matches based on code understanding
    for (const context of contextAnalysis.contexts) {
      if (context.confidence > 0.7) {
        matches.push({
          confidence: context.confidence,
          context: context.description,
          suggestions: context.alternatives,
          relatedChanges: context.suggestedRefactors.map(refactor => ({
            filePath: operation.filePath,
            oldString: refactor.from,
            newString: refactor.to,
            description: refactor.reason
          }))
        });
      }
    }

    return matches;
  }

  /**
   * Generate AI-powered insights for code changes
   */
  private async generateAIInsights(operation: EditOperation, currentCode: string, newCode: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    if (!operation.options?.aiAnalysis) {
      return insights;
    }

    // Analyze potential risks and impacts
    const riskAnalysis = this.analyzeChangeRisk(operation, currentCode, newCode);
    const performanceImpact = this.analyzePerformanceImpact(currentCode, newCode);
    const securityImpact = this.analyzeSecurityImpact(currentCode, newCode);

    if (riskAnalysis.riskLevel !== 'low') {
      insights.push({
        riskLevel: riskAnalysis.riskLevel,
        reasoning: riskAnalysis.reasoning,
        alternatives: riskAnalysis.alternatives,
        impact: {
          performance: performanceImpact.score,
          maintainability: riskAnalysis.maintainabilityImpact,
          security: securityImpact.score
        }
      });
    }

    return insights;
  }

  /**
   * Generate intelligent refactoring suggestions
   */
  private async generateRefactoringSuggestions(operation: EditOperation, code: string): Promise<EditOperation[]> {
    const suggestions: EditOperation[] = [];

    if (!operation.options?.autoRefactor) {
      return suggestions;
    }

    // Analyze code patterns for refactoring opportunities
    const patterns = this.detectRefactoringPatterns(code);

    for (const pattern of patterns) {
      if (pattern.confidence > 0.8) {
        suggestions.push({
          filePath: operation.filePath,
          oldString: pattern.pattern,
          newString: pattern.refactored,
          description: `AI-suggested refactoring: ${pattern.reason}`,
          options: { semanticMatching: true }
        });
      }
    }

    return suggestions;
  }

  /**
   * Perform a dry-run edit to preview changes without modifying files
   */
  private async dryRunEdit(operation: EditOperation): Promise<EditResult> {
    const result: EditResult = {
      success: true,
      filePath: operation.filePath,
      changes: 0,
      warnings: ['DRY RUN MODE - No files will be modified'],
      errors: []
    };

    try {
      // Validate operation
      const validation = await this.validateEdit(operation);
      if (!validation.isValid) {
        result.success = false;
        result.errors.push(...validation.issues);
        return result;
      }

      // Read content and find occurrences
      const currentContent = await this.vfs.readTextFile(operation.filePath);
      const occurrences = this.findAdvancedOccurrences(currentContent, operation.oldString, operation.options || {});

      result.changes = occurrences.length;

      if (occurrences.length > 0) {
        result.warnings.push(`Would replace ${occurrences.length} occurrence(s)`);
        result.warnings.push(`Preview: "${operation.oldString}" → "${operation.newString}"`);
      } else {
        result.warnings.push('No occurrences found to replace');
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Dry run failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Find occurrences with advanced pattern matching options
   */
  private findAdvancedOccurrences(content: string, pattern: string, options: EditOptions): Array<{start: number, end: number}> {
    const occurrences: Array<{start: number, end: number}> = [];
    let searchStart = 0;

    // Handle empty pattern
    if (!pattern || pattern.trim().length === 0) {
      return occurrences;
    }

    // Build regex pattern based on options
    let regexPattern: string;
    let flags = 'g'; // global by default

    if (options.regex) {
      // Use pattern directly as regex
      regexPattern = pattern;
    } else {
      // Escape special characters for literal matching
      regexPattern = this.escapeStringForRegex(pattern);
    }

    // Add word boundary if whole word matching is enabled
    if (options.wholeWord && !options.regex) {
      regexPattern = `\\b${regexPattern}\\b`;
    }

    // Add case insensitive flag if needed
    if (!options.caseSensitive) {
      flags += 'i';
    }

    try {
      const regex = new RegExp(regexPattern, flags);
      let match;
      let iterations = 0;
      const maxIterations = 10000; // Prevent infinite loops

      while ((match = regex.exec(content)) !== null && iterations < maxIterations) {
        iterations++;

        // Prevent infinite loops with zero-width matches
        if (match[0].length === 0) {
          // Check if we're stuck at the same position
          if (regex.lastIndex === searchStart) {
            regex.lastIndex++;
          }
          searchStart = regex.lastIndex;
          continue;
        }

        // Check for overlapping matches and adjust position
        if (match.index < searchStart) {
          searchStart = match.index + match[0].length;
          continue;
        }

        occurrences.push({
          start: match.index,
          end: match.index + match[0].length
        });

        // Check max occurrences limit
        if (options.maxOccurrences && occurrences.length >= options.maxOccurrences) {
          break;
        }

        // Move search position past this match
        searchStart = match.index + Math.max(1, match[0].length);
        regex.lastIndex = searchStart;
      }

      // Warn if we hit iteration limit
      if (iterations >= maxIterations) {
        console.warn(`[EditTool] Reached maximum iterations (${maxIterations}) while searching for pattern: ${pattern}`);
      }

    } catch (error) {
      console.error(`[EditTool] Invalid regex pattern: ${pattern}`, error);
      // Fall back to literal string search
      if (!options.regex) {
        const literalPattern = !options.caseSensitive ? pattern.toLowerCase() : pattern;
        const searchContent = !options.caseSensitive ? content.toLowerCase() : content;

        let pos = searchContent.indexOf(literalPattern, searchStart);
        while (pos !== -1 && occurrences.length < (options.maxOccurrences || Infinity)) {
          occurrences.push({
            start: pos,
            end: pos + pattern.length
          });
          searchStart = pos + pattern.length;
          pos = searchContent.indexOf(literalPattern, searchStart);
        }
      }
    }

    return occurrences;
  }

  /**
   * Escape special regex characters and handle $ sequences
   */
  private escapeStringForRegex(str: string): string {
    // Handle $ sequences specially - $1, $2, etc. should be treated literally
    // but other special regex chars should be escaped
    return str
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\\\$/g, '\\$');  // Ensure $ is properly escaped
  }

  /**
   * Analyze strings for potential issues
   */
  private analyzeString(oldString: string, newString: string): {critical: string[], warnings: string[]} {
    const critical: string[] = [];
    const warnings: string[] = [];

    // Check for problematic patterns
    if (oldString.includes('\n') && !newString.includes('\n')) {
      warnings.push('Replacing multi-line string with single-line may affect formatting');
    }

    if (oldString.length < 3) {
      warnings.push('Very short old string may match unintended occurrences');
    }

    // Check for dollar sequences
    if (oldString.includes('$') || newString.includes('$')) {
      warnings.push('Strings contain $ sequences - ensure proper escaping');
    }

    // Check for unbalanced brackets/braces
    const bracketCheck = this.checkBracketBalance(oldString, newString);
    if (!bracketCheck.balanced) {
      critical.push(`Unbalanced brackets detected: ${bracketCheck.details}`);
    }

    return { critical, warnings };
  }

  /**
   * Check bracket/brace/parenthesis balance
   */
  private checkBracketBalance(oldStr: string, newStr: string): {balanced: boolean, details: string} {
    const pairs = { '(': ')', '[': ']', '{': '}', '<': '>' };
    const openers = Object.keys(pairs);
    const closers = Object.values(pairs);

    const countChars = (str: string, chars: string[]) =>
      chars.reduce((count, char) => count + (str.split(char).length - 1), 0);

    const oldOpens = countChars(oldStr, openers);
    const oldCloses = countChars(oldStr, closers);
    const newOpens = countChars(newStr, openers);
    const newCloses = countChars(newStr, closers);

    const netOpens = oldOpens - oldCloses;
    const netCloses = newOpens - newCloses;

    if (netOpens !== netCloses) {
      return {
        balanced: false,
        details: `Bracket balance mismatch: ${netOpens} → ${netCloses}`
      };
    }

    return { balanced: true, details: '' };
  }

  /**
   * Validate syntax safety of replacement
   */
  private validateSyntaxReplacement(
    oldStr: string,
    newStr: string,
    beforeContext: string,
    afterContext: string
  ): {isValid: boolean, issue?: string} {
    // Basic syntax checks
    const combined = beforeContext + newStr + afterContext;

    // Check for common syntax breakers
    if (combined.includes('{{') && !combined.includes('}}')) {
      return { isValid: false, issue: 'Unclosed template literal' };
    }

    if (combined.includes('/*') && !combined.includes('*/')) {
      return { isValid: false, issue: 'Unclosed block comment' };
    }

    return { isValid: true };
  }

  /**
   * Validate final content before writing
   */
  private async validateFinalContent(filePath: string, content: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      issues: [],
      suggestions: []
    };

    // Basic content validation
    if (content.length === 0) {
      result.isValid = false;
      result.issues.push('Resulting content is empty');
      return result;
    }

    // File-type specific validation
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.json':
        try {
          JSON.parse(content);
        } catch (e) {
          result.isValid = false;
          result.issues.push(`Invalid JSON: ${e.message}`);
        }
        break;

      case '.js':
      case '.ts':
        // Basic syntax check for obvious issues
        if (content.includes('{{{') || content.includes('}}}')) {
          result.suggestions.push('Potential template literal syntax issue');
        }
        break;
    }

    return result;
  }

  /**
   * Generate suggestions for failed searches
   */
  private generateSearchSuggestions(searchString: string, content: string): string[] {
    const suggestions: string[] = [];

    // Check for similar strings
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchString.substring(0, Math.min(10, searchString.length)))) {
        suggestions.push(`  Line ${i + 1}: ${lines[i].trim().substring(0, 80)}...`);
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('  No similar strings found in file');
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Create a backup of the file
   */
  private async createBackup(filePath: string): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.backup.${timestamp}`;

      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      console.warn(`Failed to create backup: ${error.message}`);
      return null;
    }
  }

  /**
   * Restore from backup
   */
  private async restoreFromBackup(originalPath: string, backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, originalPath);
      // Optionally clean up backup after successful restore
      // await fs.unlink(backupPath);
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate file path
   */
  private isValidFilePath(filePath: string): boolean {
    // Basic path validation
    return path.isAbsolute(filePath) || filePath.startsWith('./') || filePath.startsWith('.\\');
  }

  /**
   * Record operation in history
   */
  private recordOperation(operation: EditOperation): void {
    this.operationHistory.push(operation);

    // Maintain history size limit
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }
  }

  /**
   * Perform batch edit operations atomically
   */
  async batchEdit(operations: EditOperation[]): Promise<EditResult[]> {
    const results: EditResult[] = [];
    const backups: string[] = [];

    try {
      // Phase 1: Validate all operations and create backups
      for (const operation of operations) {
        const validation = await this.validateEdit(operation);
        if (!validation.isValid) {
          return operations.map((_, index) => ({
            success: false,
            filePath: operations[index].filePath,
            changes: 0,
            warnings: [],
            errors: validation.issues
          }));
        }

        // Create backup for each file
        const backupPath = await this.createBackup(operation.filePath);
        if (backupPath) {
          backups.push(backupPath);
        }
      }

      // Phase 2: Execute all operations
      for (const operation of operations) {
        const result = await this.safeEdit(operation);
        results.push(result);

        // Stop on first failure
        if (!result.success) {
          break;
        }
      }

      // Phase 3: Rollback on failure
      if (results.some(r => !r.success) && backups.length > 0) {
        for (let i = 0; i < operations.length && i < backups.length; i++) {
          try {
            await this.restoreFromBackup(operations[i].filePath, backups[i]);
          } catch (error) {
            // Log rollback failure but continue
            console.warn(`Failed to rollback ${operations[i].filePath}: ${error.message}`);
          }
        }
      }

    } catch (error) {
      // Global failure - attempt to restore all backups
      for (let i = 0; i < operations.length && i < backups.length; i++) {
        try {
          await this.restoreFromBackup(operations[i].filePath, backups[i]);
        } catch (restoreError) {
          console.error(`Critical: Failed to restore backup for ${operations[i].filePath}`);
        }
      }

      throw error;
    }

    return results;
  }

  /**
   * Generate unified diff for edit operation
   */
  generateDiff(oldContent: string, newContent: string, filePath: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;

    // Simple diff implementation (could be enhanced with proper diff algorithm)
    const maxLines = Math.max(oldLines.length, newLines.length);
    let addedLines = 0;
    let removedLines = 0;

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (oldLine) {
          diff += `-${oldLine}\n`;
          removedLines++;
        }
        if (newLine) {
          diff += `+${newLine}\n`;
          addedLines++;
        }
      }
    }

    return diff + `\n@@ Summary: +${addedLines} -${removedLines} lines @@\n`;
  }

  /**
   * Get operation history
   */
  getOperationHistory(): EditOperation[] {
    return [...this.operationHistory];
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(): Promise<EditResult> {
    if (this.operationHistory.length === 0) {
      return {
        success: false,
        filePath: '',
        changes: 0,
        warnings: [],
        errors: ['No operations to undo']
      };
    }

    const lastOperation = this.operationHistory.pop()!;

    // Create reverse operation
    const reverseOperation: EditOperation = {
      filePath: lastOperation.filePath,
      oldString: lastOperation.newString,
      newString: lastOperation.oldString,
      description: `Undo: ${lastOperation.description || 'Edit operation'}`
    };

    return this.safeEdit(reverseOperation);
  }

  // ============================================================================
  // AI-POWERED ANALYSIS METHODS
  // ============================================================================

  /**
   * Analyze abstract syntax tree for semantic understanding
   */
  private analyzeAbstractSyntaxTree(code: string): any {
    // Placeholder for AST analysis - would integrate with TypeScript compiler API
    return {
      functions: code.match(/function\s+\w+/g) || [],
      classes: code.match(/class\s+\w+/g) || [],
      imports: code.match(/import\s+.*from/g) || [],
      exports: code.match(/export\s+(const|function|class)/g) || []
    };
  }

  /**
   * Analyze code context for semantic matching
   */
  private analyzeCodeContext(code: string, pattern: string): any {
    // Advanced context analysis
    const contexts = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(pattern)) {
        // Analyze surrounding context
        const beforeContext = lines.slice(Math.max(0, i - 3), i).join('\n');
        const afterContext = lines.slice(i + 1, Math.min(lines.length, i + 4)).join('\n');

        contexts.push({
          confidence: this.calculateContextConfidence(beforeContext, line, afterContext),
          description: `Context around line ${i + 1}: ${this.summarizeContext(beforeContext, afterContext)}`,
          alternatives: this.generateContextAlternatives(line, pattern),
          suggestedRefactors: this.identifyRefactoringOpportunities(line, beforeContext, afterContext)
        });
      }
    }

    return { contexts };
  }

  /**
   * Calculate confidence score for semantic context
   */
  private calculateContextConfidence(before: string, current: string, after: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on context quality
    if (before.includes('function') || before.includes('class')) confidence += 0.2;
    if (after.includes('return') || after.includes('}')) confidence += 0.1;
    if (current.includes('const') || current.includes('let')) confidence += 0.1;
    if (current.match(/\w+\s*\([^)]*\)\s*{/)) confidence += 0.3; // Function definition

    return Math.min(1.0, confidence);
  }

  /**
   * Summarize code context for AI analysis
   */
  private summarizeContext(before: string, after: string): string {
    const summary = [];

    if (before.includes('function')) summary.push('function context');
    if (before.includes('class')) summary.push('class context');
    if (before.includes('import')) summary.push('import section');
    if (after.includes('return')) summary.push('return statement nearby');
    if (after.includes('if') || after.includes('for')) summary.push('control flow nearby');

    return summary.length > 0 ? summary.join(', ') : 'general code context';
  }

  /**
   * Generate alternative implementations for context
   */
  private generateContextAlternatives(line: string, pattern: string): string[] {
    const alternatives = [];

    // Simple pattern-based alternatives
    if (line.includes('var ')) {
      alternatives.push('Consider using const or let instead of var');
    }

    if (line.match(/\w+\.\w+\s*\(/) && !line.includes('this.')) {
      alternatives.push('Consider using optional chaining (?.) for safer property access');
    }

    if (line.includes('==') && !line.includes('===') && !line.includes('!=') && !line.includes('!==')) {
      alternatives.push('Consider using === for strict equality comparison');
    }

    return alternatives;
  }

  /**
   * Identify refactoring opportunities in code context
   */
  private identifyRefactoringOpportunities(line: string, before: string, after: string): any[] {
    const opportunities = [];

    // Detect long functions
    if (before.split('\n').length > 20) {
      opportunities.push({
        from: line,
        to: line, // Would need more context for actual refactoring
        reason: 'Consider breaking down long functions into smaller, focused functions'
      });
    }

    // Detect magic numbers
    const magicNumbers = line.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 0) {
      opportunities.push({
        from: magicNumbers[0],
        to: `const ${magicNumbers[0]} = ${magicNumbers[0]}; // Extract magic number`,
        reason: 'Extract magic numbers into named constants'
      });
    }

    return opportunities;
  }

  /**
   * Analyze risk level of code changes
   */
  private analyzeChangeRisk(operation: EditOperation, oldCode: string, newCode: string): any {
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let reasoning = '';
    const alternatives: string[] = [];
    let maintainabilityImpact = 0;

    // Analyze change complexity
    const oldLines = oldCode.split('\n').length;
    const newLines = newCode.split('\n').length;
    const lineChangeRatio = Math.abs(newLines - oldLines) / Math.max(oldLines, 1);

    if (lineChangeRatio > 0.5) {
      riskLevel = 'medium';
      reasoning = 'Significant code changes may introduce bugs';
      maintainabilityImpact = -10;
    }

    // Check for potentially breaking changes
    if (operation.oldString.includes('export') || operation.newString.includes('export')) {
      riskLevel = 'high';
      reasoning = 'Export changes may break module interfaces';
      alternatives.push('Consider gradual migration with deprecation warnings');
    }

    if (operation.oldString.includes('public') && operation.newString.includes('private')) {
      riskLevel = 'high';
      reasoning = 'Reducing API visibility may break consumers';
      alternatives.push('Maintain backward compatibility with overloads');
    }

    // Performance impact analysis
    if (operation.newString.includes('for') && operation.newString.includes('for')) {
      riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
      reasoning += reasoning ? '; ' : '' + 'Nested loops may impact performance';
      maintainabilityImpact -= 5;
    }

    return {
      riskLevel,
      reasoning: reasoning || 'Low-risk change with standard refactoring patterns',
      alternatives,
      maintainabilityImpact
    };
  }

  /**
   * Analyze performance impact of code changes
   */
  private analyzePerformanceImpact(oldCode: string, newCode: string): { score: number; details: string } {
    let score = 0;
    let details = '';

    // Check for performance improvements
    if (newCode.includes('Map(') && !oldCode.includes('Map(')) {
      score += 10;
      details = 'Using Map for better performance in lookups';
    }

    if (newCode.includes('Set(') && !oldCode.includes('Set(')) {
      score += 5;
      details = 'Using Set for efficient membership testing';
    }

    // Check for potential performance issues
    if (newCode.includes('.forEach') && oldCode.includes('for (')) {
      score -= 5;
      details = 'Switching from for loop to forEach may impact performance';
    }

    const newConcatCount = (newCode.match(/\+/g) || []).length;
    const oldConcatCount = (oldCode.match(/\+/g) || []).length;
    if (newConcatCount > oldConcatCount + 2) {
      score -= 10;
      details = 'Excessive string concatenation detected';
    }

    return { score, details: details || 'No significant performance impact detected' };
  }

  /**
   * Analyze security impact of code changes
   */
  private analyzeSecurityImpact(oldCode: string, newCode: string): { score: number; vulnerabilities: string[] } {
    let score = 0;
    const vulnerabilities: string[] = [];

    // Check for security improvements
    if (newCode.includes('encodeURIComponent') && !oldCode.includes('encodeURIComponent')) {
      score += 15;
      vulnerabilities.push('Added proper URL encoding');
    }

    if (newCode.includes('helmet(') && !oldCode.includes('helmet(')) {
      score += 20;
      vulnerabilities.push('Added security headers');
    }

    // Check for potential security issues
    if (newCode.includes('eval(') && !oldCode.includes('eval(')) {
      score -= 50;
      vulnerabilities.push('CRITICAL: Introduced eval() usage');
    }

    if (newCode.includes('innerHTML') && !oldCode.includes('innerHTML')) {
      score -= 20;
      vulnerabilities.push('Potential XSS vulnerability introduced');
    }

    const newSqlMatches = newCode.match(/(SELECT|INSERT|UPDATE|DELETE)/gi) || [];
    const oldSqlMatches = oldCode.match(/(SELECT|INSERT|UPDATE|DELETE)/gi) || [];
    if (newSqlMatches.length > oldSqlMatches.length) {
      score -= 15;
      vulnerabilities.push('Added SQL operations - verify against injection');
    }

    return { score, vulnerabilities };
  }

  /**
   * Detect code patterns that could benefit from refactoring
   */
  private detectRefactoringPatterns(code: string): any[] {
    const patterns = [];

    // Long parameter lists
    const functions = code.match(/function\s+\w+\s*\([^)]*\)/g) || [];
    for (const func of functions) {
      const paramMatch = func.match(/\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[1].split(',').length;
        if (params > 4) {
          patterns.push({
            pattern: func,
            refactored: func.replace(/\(([^)]*)\)/, '({ ...params })'), // Convert to options object
            reason: `Function has ${params} parameters - consider using options object`,
            confidence: 0.9
          });
        }
      }
    }

    // Nested conditionals
    const nestedIfs = code.match(/if\s*\([^}]*if\s*\(/g);
    if (nestedIfs && nestedIfs.length > 0) {
      patterns.push({
        pattern: 'nested if statements',
        refactored: 'early returns or guard clauses',
        reason: 'Nested conditionals reduce readability - consider early returns',
        confidence: 0.85
      });
    }

    // Long methods
    const methodBodies = code.split(/function\s+\w+\s*\([^)]*\)\s*{/);
    for (const body of methodBodies.slice(1)) {
      const lines = body.split('\n').length;
      if (lines > 30) {
        patterns.push({
          pattern: `long method (${lines} lines)`,
          refactored: 'smaller, focused methods',
          reason: 'Long methods are hard to understand and maintain',
          confidence: 0.8
        });
      }
    }

    return patterns;
  }
}

// Export a default instance for convenience
export const editTool = new EnhancedEditTool();

// Export types for external use
export type { EditOperation, EditResult, ValidationResult };
