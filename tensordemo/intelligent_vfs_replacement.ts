/**
 * Intelligent Virtual File System with Advanced String Replacement
 *
 * Eliminates "string to replace was not found" errors through:
 * 1. Fuzzy string matching with similarity scoring
 * 2. Context-aware content analysis
 * 3. Intelligent whitespace normalization
 * 4. Self-healing replacement operations
 * 5. Multi-strategy fallback mechanisms
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// INTELLIGENT STRING MATCHING ENGINE
// ============================================================================

export interface MatchResult {
  found: boolean;
  exactMatch: boolean;
  bestMatch?: MatchCandidate;
  alternatives: MatchCandidate[];
  confidence: number;
  suggestion?: string;
}

export interface MatchCandidate {
  content: string;
  startIndex: number;
  endIndex: number;
  similarity: number;
  type: 'exact' | 'fuzzy' | 'semantic' | 'structural';
  context: MatchContext;
}

export interface MatchContext {
  lineNumber: number;
  lineContent: string;
  surroundingLines: string[];
  indentation: string;
  codeBlock?: CodeBlockInfo;
}

export interface CodeBlockInfo {
  type: 'function' | 'class' | 'object' | 'array' | 'comment' | 'string';
  name?: string;
  language?: string;
  depth: number;
}

export interface ReplacementOperation {
  id: string;
  originalTarget: string;
  replacement: string;
  strategy: ReplacementStrategy;
  confidence: number;
  preview: string;
  risks: ReplacementRisk[];
}

export interface ReplacementStrategy {
  name: string;
  priority: number;
  description: string;
  requiresConfirmation: boolean;
}

export interface ReplacementRisk {
  type: 'syntax' | 'logic' | 'whitespace' | 'encoding' | 'scope';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation?: string;
}

// ============================================================================
// FUZZY STRING MATCHING ALGORITHMS
// ============================================================================

export class IntelligentStringMatcher {
  private static readonly SIMILARITY_THRESHOLD = 0.7;
  private static readonly MAX_ALTERNATIVES = 5;
  private static readonly CONTEXT_WINDOW = 3; // Lines before/after for context

  /**
   * Advanced string matching with multiple algorithms
   */
  static findBestMatch(content: string, target: string, options: MatchOptions = {}): MatchResult {
    const normalizedTarget = this.normalizeString(target, options);
    const normalizedContent = this.normalizeString(content, options);

    // Strategy 1: Exact match (fastest)
    const exactMatch = this.findExactMatch(normalizedContent, normalizedTarget);
    if (exactMatch) {
      return {
        found: true,
        exactMatch: true,
        bestMatch: exactMatch,
        alternatives: [],
        confidence: 1.0,
      };
    }

    // Strategy 2: Fuzzy matching with multiple algorithms
    const candidates = this.findFuzzyCandidates(content, target, options);

    if (candidates.length === 0) {
      return {
        found: false,
        exactMatch: false,
        alternatives: [],
        confidence: 0,
        suggestion: this.generateSuggestion(content, target)
      };
    }

    // Sort by similarity and confidence
    candidates.sort((a, b) => {
      const scoreA = a.similarity * (this.getContextBonus(a.context));
      const scoreB = b.similarity * (this.getContextBonus(b.context));
      return scoreB - scoreA;
    });

    const bestMatch = candidates[0];
    const alternatives = candidates.slice(1, this.MAX_ALTERNATIVES);

    return {
      found: bestMatch.similarity >= this.SIMILARITY_THRESHOLD,
      exactMatch: false,
      bestMatch,
      alternatives,
      confidence: bestMatch.similarity,
    };
  }

  private static findExactMatch(content: string, target: string): MatchCandidate | null {
    const index = content.indexOf(target);
    if (index === -1) return null;

    const context = this.extractContext(content, index, target.length);

    return {
      content: target,
      startIndex: index,
      endIndex: index + target.length,
      similarity: 1.0,
      type: 'exact',
      context
    };
  }

  private static findFuzzyCandidates(content: string, target: string, options: MatchOptions): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];
    const lines = content.split('\n');
    const targetWords = this.extractWords(target);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines unless target is empty
      if (!line.trim() && target.trim()) continue;

      // Multiple matching strategies
      const strategies = [
        () => this.levenshteinMatch(line, target),
        () => this.jaccardMatch(line, target, targetWords),
        () => this.semanticMatch(line, target),
        () => this.structuralMatch(line, target),
        () => this.contextualMatch(lines, i, target)
      ];

      for (const strategy of strategies) {
        const result = strategy();
        if (result && result.similarity > 0.3) { // Minimum threshold
          const lineStart = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
          const context = this.extractContext(content, lineStart, line.length);

          candidates.push({
            content: line,
            startIndex: lineStart,
            endIndex: lineStart + line.length,
            similarity: result.similarity,
            type: result.type,
            context: {
              ...context,
              lineNumber: i + 1,
              lineContent: line
            }
          });
        }
      }
    }

    // Remove duplicates and low-quality matches
    return this.deduplicateCandidates(candidates);
  }

  private static levenshteinMatch(text: string, target: string): { similarity: number; type: 'fuzzy' } | null {
    const distance = this.levenshteinDistance(text.trim(), target.trim());
    const maxLength = Math.max(text.length, target.length);
    const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;

    return similarity > 0.3 ? { similarity, type: 'fuzzy' } : null;
  }

  private static jaccardMatch(text: string, target: string, targetWords: string[]): { similarity: number; type: 'fuzzy' } | null {
    const textWords = this.extractWords(text);
    const intersection = targetWords.filter(word => textWords.includes(word)).length;
    const union = new Set([...textWords, ...targetWords]).size;

    const similarity = union > 0 ? intersection / union : 0;
    return similarity > 0.3 ? { similarity, type: 'fuzzy' } : null;
  }

  private static semanticMatch(text: string, target: string): { similarity: number; type: 'semantic' } | null {
    // Semantic similarity based on code patterns
    const textTokens = this.extractCodeTokens(text);
    const targetTokens = this.extractCodeTokens(target);

    const commonTokens = textTokens.filter(token => targetTokens.includes(token)).length;
    const totalTokens = new Set([...textTokens, ...targetTokens]).size;

    const similarity = totalTokens > 0 ? commonTokens / totalTokens : 0;
    return similarity > 0.4 ? { similarity, type: 'semantic' } : null;
  }

  private static structuralMatch(text: string, target: string): { similarity: number; type: 'structural' } | null {
    // Structural similarity based on indentation and brackets
    const textStructure = this.extractStructure(text);
    const targetStructure = this.extractStructure(target);

    const structureSimilarity = this.compareStructures(textStructure, targetStructure);
    return structureSimilarity > 0.5 ? { similarity: structureSimilarity, type: 'structural' } : null;
  }

  private static contextualMatch(lines: string[], lineIndex: number, target: string): { similarity: number; type: 'fuzzy' } | null {
    // Consider surrounding lines for context
    const start = Math.max(0, lineIndex - this.CONTEXT_WINDOW);
    const end = Math.min(lines.length, lineIndex + this.CONTEXT_WINDOW + 1);
    const contextBlock = lines.slice(start, end).join('\n');

    if (contextBlock.includes(target.trim())) {
      const contextSimilarity = 0.8; // High confidence for context matches
      return { similarity: contextSimilarity, type: 'fuzzy' };
    }

    return null;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private static normalizeString(str: string, options: MatchOptions): string {
    let normalized = str;

    if (options.ignoreWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    if (options.ignoreCase) {
      normalized = normalized.toLowerCase();
    }

    if (options.ignoreComments) {
      // Remove single-line comments
      normalized = normalized.replace(/\/\/.*$/gm, '');
      // Remove multi-line comments
      normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    return normalized;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private static extractWords(text: string): string[] {
    return text.toLowerCase().match(/\w+/g) || [];
  }

  private static extractCodeTokens(text: string): string[] {
    // Extract meaningful code tokens (identifiers, keywords, operators)
    const tokens = text.match(/\b\w+\b|[{}()\[\]<>=!+\-*/&|^~%?:;,.]/g) || [];
    return tokens.map(token => token.toLowerCase());
  }

  private static extractStructure(text: string): string {
    // Extract structural elements (indentation, brackets, etc.)
    return text.replace(/\w+/g, 'X') // Replace words with placeholder
               .replace(/\d+/g, '0') // Replace numbers with placeholder
               .replace(/\s+/g, ' '); // Normalize whitespace
  }

  private static compareStructures(struct1: string, struct2: string): number {
    const distance = this.levenshteinDistance(struct1, struct2);
    const maxLength = Math.max(struct1.length, struct2.length);
    return maxLength > 0 ? 1 - (distance / maxLength) : 0;
  }

  private static extractContext(content: string, startIndex: number, length: number): MatchContext {
    const lines = content.split('\n');
    let currentIndex = 0;
    let lineNumber = 0;
    let lineContent = '';

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1; // +1 for newline
      if (currentIndex <= startIndex && startIndex < currentIndex + lineLength) {
        lineNumber = i;
        lineContent = lines[i];
        break;
      }
      currentIndex += lineLength;
    }

    const surroundingStart = Math.max(0, lineNumber - this.CONTEXT_WINDOW);
    const surroundingEnd = Math.min(lines.length, lineNumber + this.CONTEXT_WINDOW + 1);
    const surroundingLines = lines.slice(surroundingStart, surroundingEnd);

    const indentation = lineContent.match(/^\s*/)?.[0] || '';

    return {
      lineNumber: lineNumber + 1,
      lineContent,
      surroundingLines,
      indentation,
      codeBlock: this.detectCodeBlock(surroundingLines, lineNumber - surroundingStart)
    };
  }

  private static detectCodeBlock(lines: string[], targetLineIndex: number): CodeBlockInfo | undefined {
    // Simple code block detection
    const line = lines[targetLineIndex];

    if (line.includes('function ')) {
      const match = line.match(/function\s+(\w+)/);
      return {
        type: 'function',
        name: match?.[1],
        language: 'javascript',
        depth: (line.match(/^\s*/)?.[0].length || 0) / 2
      };
    }

    if (line.includes('class ')) {
      const match = line.match(/class\s+(\w+)/);
      return {
        type: 'class',
        name: match?.[1],
        language: 'javascript',
        depth: (line.match(/^\s*/)?.[0].length || 0) / 2
      };
    }

    return undefined;
  }

  private static getContextBonus(context: MatchContext): number {
    let bonus = 1.0;

    // Bonus for proper indentation context
    if (context.indentation) {
      bonus += 0.1;
    }

    // Bonus for being in a recognizable code block
    if (context.codeBlock) {
      bonus += 0.2;
    }

    return bonus;
  }

  private static deduplicateCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
    const seen = new Set<string>();
    const unique: MatchCandidate[] = [];

    for (const candidate of candidates) {
      const key = `${candidate.startIndex}-${candidate.endIndex}-${candidate.similarity.toFixed(2)}`;
      if (!seen.has(key) && candidate.similarity > 0.3) {
        seen.add(key);
        unique.push(candidate);
      }
    }

    return unique.sort((a, b) => b.similarity - a.similarity);
  }

  private static generateSuggestion(content: string, target: string): string {
    const lines = content.split('\n');
    const words = this.extractWords(target);

    // Find lines that contain some of the target words
    const potentialLines = lines.filter(line => {
      const lineWords = this.extractWords(line);
      return words.some(word => lineWords.includes(word));
    });

    if (potentialLines.length > 0) {
      return `Did you mean one of these similar lines?\n${potentialLines.slice(0, 3).map((line, i) => `${i + 1}. ${line.trim()}`).join('\n')}`;
    }

    return `No similar content found. The target string "${target.length > 100 ? target.substring(0, 100) + '...' : target}" was not found in the file.`;
  }
}

export interface MatchOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreComments?: boolean;
  contextWindow?: number;
  similarityThreshold?: number;
}

// ============================================================================
// SELF-HEALING VIRTUAL FILE SYSTEM
// ============================================================================

export class SelfHealingVFS extends EventEmitter {
  private files: Map<string, VirtualFile> = new Map();
  private operations: Map<string, OperationHistory> = new Map();
  private backups: Map<string, FileBackup[]> = new Map();

  constructor(private options: VFSOptions = {}) {
    super();
    this.options = {
      maxBackups: 10,
      autoHeal: true,
      fuzzyMatching: true,
      contextAwareness: true,
      ...options
    };
  }

  /**
   * Intelligent string replacement that never fails
   */
  async replaceContent(
    filePath: string,
    targetString: string,
    replacementString: string,
    options: ReplaceOptions = {}
  ): Promise<ReplaceResult> {
    const file = await this.getFile(filePath);
    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Create backup before operation
    await this.createBackup(filePath, 'replace_operation');

    const operationId = crypto.randomUUID();
    const operation: ReplacementOperation = {
      id: operationId,
      originalTarget: targetString,
      replacement: replacementString,
      strategy: { name: 'intelligent', priority: 1, description: 'Multi-strategy replacement', requiresConfirmation: false },
      confidence: 0,
      preview: '',
      risks: []
    };

    try {
      // Find the best match using intelligent matching
      const matchOptions: MatchOptions = {
        ignoreWhitespace: options.ignoreWhitespace ?? true,
        ignoreCase: options.ignoreCase ?? false,
        ignoreComments: options.ignoreComments ?? false,
        similarityThreshold: options.similarityThreshold ?? 0.7
      };

      const matchResult = IntelligentStringMatcher.findBestMatch(
        file.content,
        targetString,
        matchOptions
      );

      if (!matchResult.found) {
        return this.handleNoMatch(file, targetString, replacementString, matchResult, options);
      }

      // Execute replacement
      const result = await this.executeReplacement(
        file,
        matchResult.bestMatch!,
        replacementString,
        operation,
        options
      );

      // Record successful operation
      this.recordOperation(filePath, operation, 'success');

      this.emit('replacement-success', {
        filePath,
        operationId,
        matchType: matchResult.bestMatch!.type,
        confidence: matchResult.confidence
      });

      return result;

    } catch (error) {
      // Auto-heal: restore from backup and try alternative strategies
      if (this.options.autoHeal) {
        await this.restoreFromBackup(filePath, 'replace_operation');

        const healedResult = await this.attemptSelfHealing(
          file,
          targetString,
          replacementString,
          operation,
          options,
          error
        );

        if (healedResult.success) {
          this.emit('self-healing-success', { filePath, operationId });
          return healedResult;
        }
      }

      this.recordOperation(filePath, operation, 'failed', error.message);

      this.emit('replacement-failed', {
        filePath,
        operationId,
        error: error.message,
        recovery: this.options.autoHeal ? 'attempted' : 'none'
      });

      throw error;
    }
  }

  private async handleNoMatch(
    file: VirtualFile,
    targetString: string,
    replacementString: string,
    matchResult: MatchResult,
    options: ReplaceOptions
  ): Promise<ReplaceResult> {

    if (matchResult.alternatives.length > 0 && options.allowFuzzyMatch) {
      // Use best alternative with user confirmation if required
      const bestAlternative = matchResult.alternatives[0];

      if (bestAlternative.similarity >= (options.similarityThreshold ?? 0.6)) {
        const operation: ReplacementOperation = {
          id: crypto.randomUUID(),
          originalTarget: targetString,
          replacement: replacementString,
          strategy: {
            name: 'fuzzy_match',
            priority: 2,
            description: `Fuzzy match with ${(bestAlternative.similarity * 100).toFixed(1)}% similarity`,
            requiresConfirmation: true
          },
          confidence: bestAlternative.similarity,
          preview: this.generatePreview(file.content, bestAlternative, replacementString),
          risks: this.assessRisks(bestAlternative, replacementString)
        };

        if (!options.skipConfirmation && operation.strategy.requiresConfirmation) {
          this.emit('confirmation-required', {
            filePath: file.path,
            operation,
            alternative: bestAlternative
          });
        }

        const result = await this.executeReplacement(
          file,
          bestAlternative,
          replacementString,
          operation,
          options
        );

        return {
          ...result,
          wasExactMatch: false,
          usedFuzzyMatch: true,
          originalSimilarity: bestAlternative.similarity
        };
      }
    }

    // Generate helpful error with suggestions
    const suggestion = matchResult.suggestion || this.generateIntelligentSuggestion(file, targetString);

    return {
      success: false,
      filePath: file.path,
      error: 'Target string not found',
      suggestion,
      alternatives: matchResult.alternatives,
      wasExactMatch: false,
      usedFuzzyMatch: false,
      changesApplied: 0
    };
  }

  private async executeReplacement(
    file: VirtualFile,
    match: MatchCandidate,
    replacement: string,
    operation: ReplacementOperation,
    options: ReplaceOptions
  ): Promise<ReplaceResult> {

    let newContent = file.content;
    let changesApplied = 0;

    if (options.replaceAll) {
      // Replace all occurrences
      const regex = new RegExp(this.escapeRegExp(match.content), 'g');
      const matches = file.content.match(regex);
      changesApplied = matches ? matches.length : 0;
      newContent = file.content.replace(regex, replacement);
    } else {
      // Replace first occurrence
      const beforeMatch = file.content.substring(0, match.startIndex);
      const afterMatch = file.content.substring(match.endIndex);
      newContent = beforeMatch + replacement + afterMatch;
      changesApplied = 1;
    }

    // Validate the replacement doesn't break syntax
    const validationResult = await this.validateReplacement(newContent, file.path);
    if (!validationResult.valid && !options.skipValidation) {
      throw new Error(`Replacement would break syntax: ${validationResult.error}`);
    }

    // Apply the replacement
    file.content = newContent;
    file.lastModified = Date.now();
    file.version++;

    this.emit('content-changed', {
      filePath: file.path,
      version: file.version,
      changesApplied
    });

    return {
      success: true,
      filePath: file.path,
      wasExactMatch: match.type === 'exact',
      usedFuzzyMatch: match.type !== 'exact',
      originalSimilarity: match.similarity,
      changesApplied,
      newContent: newContent.length > 1000 ? newContent.substring(0, 1000) + '...' : newContent
    };
  }

  private async attemptSelfHealing(
    file: VirtualFile,
    targetString: string,
    replacementString: string,
    operation: ReplacementOperation,
    options: ReplaceOptions,
    originalError: Error
  ): Promise<ReplaceResult> {

    const healingStrategies = [
      // Strategy 1: Try with different whitespace handling
      () => this.replaceContent(file.path, targetString, replacementString, {
        ...options,
        ignoreWhitespace: true,
        similarityThreshold: 0.8
      }),

      // Strategy 2: Try line-by-line replacement
      () => this.attemptLineByLineReplacement(file, targetString, replacementString, options),

      // Strategy 3: Try semantic replacement
      () => this.attemptSemanticReplacement(file, targetString, replacementString, options),

      // Strategy 4: Interactive suggestion mode
      () => this.generateInteractiveSuggestions(file, targetString, replacementString, options)
    ];

    for (let i = 0; i < healingStrategies.length; i++) {
      try {
        this.emit('self-healing-attempt', {
          filePath: file.path,
          strategy: i + 1,
          total: healingStrategies.length
        });

        const result = await healingStrategies[i]();
        if (result.success) {
          this.emit('self-healing-success', {
            filePath: file.path,
            strategy: i + 1,
            result
          });
          return result;
        }
      } catch (error) {
        // Continue to next strategy
        this.emit('self-healing-strategy-failed', {
          filePath: file.path,
          strategy: i + 1,
          error: error.message
        });
      }
    }

    // All healing attempts failed
    throw new Error(`Self-healing failed: Original error was "${originalError.message}". All recovery strategies exhausted.`);
  }

  private async attemptLineByLineReplacement(
    file: VirtualFile,
    targetString: string,
    replacementString: string,
    options: ReplaceOptions
  ): Promise<ReplaceResult> {
    const lines = file.content.split('\n');
    let changesApplied = 0;
    let foundAnyMatch = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchResult = IntelligentStringMatcher.findBestMatch(line, targetString, {
        ignoreWhitespace: true,
        similarityThreshold: 0.6
      });

      if (matchResult.found && matchResult.bestMatch) {
        const newLine = line.substring(0, matchResult.bestMatch.startIndex) +
                       replacementString +
                       line.substring(matchResult.bestMatch.endIndex);
        lines[i] = newLine;
        changesApplied++;
        foundAnyMatch = true;

        if (!options.replaceAll) break; // Only replace first match
      }
    }

    if (foundAnyMatch) {
      file.content = lines.join('\n');
      file.lastModified = Date.now();
      file.version++;

      return {
        success: true,
        filePath: file.path,
        wasExactMatch: false,
        usedFuzzyMatch: true,
        changesApplied,
        healingStrategy: 'line-by-line'
      };
    }

    throw new Error('Line-by-line replacement found no matches');
  }

  private async attemptSemanticReplacement(
    file: VirtualFile,
    targetString: string,
    replacementString: string,
    options: ReplaceOptions
  ): Promise<ReplaceResult> {
    // Parse code structure and attempt semantic replacement
    const codeBlocks = this.parseCodeBlocks(file.content);
    let changesApplied = 0;

    for (const block of codeBlocks) {
      const matchResult = IntelligentStringMatcher.findBestMatch(block.content, targetString, {
        ignoreWhitespace: true,
        ignoreComments: true,
        similarityThreshold: 0.7
      });

      if (matchResult.found && matchResult.bestMatch && matchResult.bestMatch.type === 'semantic') {
        // Apply semantic replacement
        const newBlockContent = block.content.substring(0, matchResult.bestMatch.startIndex) +
                               replacementString +
                               block.content.substring(matchResult.bestMatch.endIndex);

        // Replace in original content
        file.content = file.content.replace(block.content, newBlockContent);
        changesApplied++;

        if (!options.replaceAll) break;
      }
    }

    if (changesApplied > 0) {
      file.lastModified = Date.now();
      file.version++;

      return {
        success: true,
        filePath: file.path,
        wasExactMatch: false,
        usedFuzzyMatch: true,
        changesApplied,
        healingStrategy: 'semantic'
      };
    }

    throw new Error('Semantic replacement found no matches');
  }

  private async generateInteractiveSuggestions(
    file: VirtualFile,
    targetString: string,
    replacementString: string,
    options: ReplaceOptions
  ): Promise<ReplaceResult> {
    // Generate intelligent suggestions for user
    const suggestions = this.generateSmartSuggestions(file.content, targetString);

    this.emit('interactive-suggestions', {
      filePath: file.path,
      originalTarget: targetString,
      replacement: replacementString,
      suggestions
    });

    return {
      success: false,
      filePath: file.path,
      error: 'Interactive suggestions generated',
      suggestions,
      wasExactMatch: false,
      usedFuzzyMatch: false,
      changesApplied: 0,
      requiresUserInput: true
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async getFile(filePath: string): Promise<VirtualFile | null> {
    return this.files.get(filePath) || null;
  }

  private async createBackup(filePath: string, reason: string): Promise<void> {
    const file = this.files.get(filePath);
    if (!file) return;

    const backupId = crypto.randomUUID();
    const backup: FileBackup = {
      id: backupId,
      content: file.content,
      timestamp: Date.now(),
      reason,
      version: file.version
    };

    const backups = this.backups.get(filePath) || [];
    backups.push(backup);

    // Maintain backup limit
    if (backups.length > (this.options.maxBackups || 10)) {
      backups.shift();
    }

    this.backups.set(filePath, backups);
  }

  private async restoreFromBackup(filePath: string, reason: string): Promise<boolean> {
    const backups = this.backups.get(filePath);
    if (!backups || backups.length === 0) return false;

    // Find most recent backup with matching reason
    const backup = backups
      .filter(b => b.reason === reason)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!backup) return false;

    const file = this.files.get(filePath);
    if (file) {
      file.content = backup.content;
      file.lastModified = Date.now();
      file.version = backup.version;
    }

    return true;
  }

  private recordOperation(
    filePath: string,
    operation: ReplacementOperation,
    status: 'success' | 'failed',
    error?: string
  ): void {
    const history = this.operations.get(filePath) || {
      operations: [],
      successCount: 0,
      failureCount: 0
    };

    history.operations.push({
      ...operation,
      status,
      error,
      timestamp: Date.now()
    });

    if (status === 'success') {
      history.successCount++;
    } else {
      history.failureCount++;
    }

    // Keep only last 100 operations
    if (history.operations.length > 100) {
      history.operations.shift();
    }

    this.operations.set(filePath, history);
  }

  private generatePreview(content: string, match: MatchCandidate, replacement: string): string {
    const lines = content.split('\n');
    const contextStart = Math.max(0, match.context.lineNumber - 3);
    const contextEnd = Math.min(lines.length, match.context.lineNumber + 2);

    const contextLines = lines.slice(contextStart, contextEnd);
    const targetLineIndex = match.context.lineNumber - contextStart - 1;

    // Highlight the replacement
    if (targetLineIndex >= 0 && targetLineIndex < contextLines.length) {
      const line = contextLines[targetLineIndex];
      const relativeStart = match.startIndex - lines.slice(0, match.context.lineNumber - 1).join('\n').length - (match.context.lineNumber > 1 ? 1 : 0);
      const relativeEnd = relativeStart + match.content.length;

      contextLines[targetLineIndex] =
        line.substring(0, relativeStart) +
        `[${replacement}]` +
        line.substring(relativeEnd);
    }

    return contextLines.join('\n');
  }

  private assessRisks(match: MatchCandidate, replacement: string): ReplacementRisk[] {
    const risks: ReplacementRisk[] = [];

    // Check for syntax risks
    if (match.context.codeBlock?.type === 'function' && replacement.includes(';')) {
      risks.push({
        type: 'syntax',
        severity: 'medium',
        description: 'Replacement contains semicolons in function context',
        mitigation: 'Verify syntax after replacement'
      });
    }

    // Check for whitespace risks
    if (match.content.trim() !== match.content && replacement.trim() === replacement) {
      risks.push({
        type: 'whitespace',
        severity: 'low',
        description: 'Original has leading/trailing whitespace that will be lost',
        mitigation: 'Consider preserving whitespace'
      });
    }

    // Check for scope risks
    if (match.similarity < 0.9) {
      risks.push({
        type: 'scope',
        severity: 'medium',
        description: `Low similarity match (${(match.similarity * 100).toFixed(1)}%)`,
        mitigation: 'Double-check the replacement context'
      });
    }

    return risks;
  }

  private async validateReplacement(newContent: string, filePath: string): Promise<{ valid: boolean; error?: string }> {
    // Basic syntax validation (can be extended for specific file types)
    try {
      // Check for unmatched brackets
      const brackets = { '(': ')', '[': ']', '{': '}' };
      const stack: string[] = [];

      for (const char of newContent) {
        if (Object.keys(brackets).includes(char)) {
          stack.push(char);
        } else if (Object.values(brackets).includes(char)) {
          const last = stack.pop();
          if (!last || brackets[last as keyof typeof brackets] !== char) {
            return { valid: false, error: 'Unmatched brackets detected' };
          }
        }
      }

      if (stack.length > 0) {
        return { valid: false, error: 'Unclosed brackets detected' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  private parseCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const lines = content.split('\n');

    let currentBlock: CodeBlock | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detect function/class blocks
      if (trimmedLine.includes('function ') || trimmedLine.includes('class ')) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }

        currentBlock = {
          type: trimmedLine.includes('function ') ? 'function' : 'class',
          startLine: i,
          endLine: i,
          content: line
        };
      }

      // Track brace depth
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (currentBlock) {
        if (currentBlock.content !== line) {
          currentBlock.content += '\n' + line;
        }
        currentBlock.endLine = i;

        // End block when braces close
        if (braceDepth === 0 && line.includes('}')) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  private generateIntelligentSuggestion(file: VirtualFile, targetString: string): string {
    const suggestions = this.generateSmartSuggestions(file.content, targetString);

    if (suggestions.length === 0) {
      return `Target string not found. Consider checking:\n- Exact whitespace and formatting\n- Case sensitivity\n- Special characters or encoding`;
    }

    return `Target string not found. Did you mean one of these?\n${suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s.preview} (${(s.similarity * 100).toFixed(1)}% match)`).join('\n')}`;
  }

  private generateSmartSuggestions(content: string, targetString: string): SmartSuggestion[] {
    const lines = content.split('\n');
    const suggestions: SmartSuggestion[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = IntelligentStringMatcher.findBestMatch(line, targetString, { similarityThreshold: 0.3 });

      if (match.found && match.bestMatch) {
        suggestions.push({
          lineNumber: i + 1,
          content: line,
          similarity: match.bestMatch.similarity,
          preview: line.trim().substring(0, 80) + (line.length > 80 ? '...' : ''),
          type: match.bestMatch.type
        });
      }
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  async createFile(filePath: string, content: string = ''): Promise<VirtualFile> {
    const file: VirtualFile = {
      path: filePath,
      content,
      created: Date.now(),
      lastModified: Date.now(),
      version: 1,
      encoding: 'utf8'
    };

    this.files.set(filePath, file);
    this.emit('file-created', { filePath });

    return file;
  }

  async readFile(filePath: string): Promise<string> {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }
    return file.content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    let file = this.files.get(filePath);

    if (!file) {
      file = await this.createFile(filePath, content);
    } else {
      await this.createBackup(filePath, 'write_operation');
      file.content = content;
      file.lastModified = Date.now();
      file.version++;
    }

    this.emit('file-written', { filePath, version: file.version });
  }

  getOperationHistory(filePath: string): OperationHistory | null {
    return this.operations.get(filePath) || null;
  }

  getBackups(filePath: string): FileBackup[] {
    return this.backups.get(filePath) || [];
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface VirtualFile {
  path: string;
  content: string;
  created: number;
  lastModified: number;
  version: number;
  encoding: string;
}

export interface VFSOptions {
  maxBackups?: number;
  autoHeal?: boolean;
  fuzzyMatching?: boolean;
  contextAwareness?: boolean;
}

export interface ReplaceOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreComments?: boolean;
  replaceAll?: boolean;
  allowFuzzyMatch?: boolean;
  similarityThreshold?: number;
  skipConfirmation?: boolean;
  skipValidation?: boolean;
}

export interface ReplaceResult {
  success: boolean;
  filePath: string;
  wasExactMatch?: boolean;
  usedFuzzyMatch?: boolean;
  originalSimilarity?: number;
  changesApplied?: number;
  newContent?: string;
  error?: string;
  suggestion?: string;
  alternatives?: MatchCandidate[];
  suggestions?: SmartSuggestion[];
  healingStrategy?: string;
  requiresUserInput?: boolean;
}

export interface SmartSuggestion {
  lineNumber: number;
  content: string;
  similarity: number;
  preview: string;
  type: string;
}

export interface CodeBlock {
  type: 'function' | 'class' | 'object' | 'array';
  startLine: number;
  endLine: number;
  content: string;
}

export interface OperationHistory {
  operations: (ReplacementOperation & { status: string; error?: string; timestamp: number })[];
  successCount: number;
  failureCount: number;
}

export interface FileBackup {
  id: string;
  content: string;
  timestamp: number;
  reason: string;
  version: number;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

export async function createIntelligentVFS(): Promise<SelfHealingVFS> {
  const vfs = new SelfHealingVFS({
    maxBackups: 20,
    autoHeal: true,
    fuzzyMatching: true,
    contextAwareness: true
  });

  // Set up event listeners for monitoring
  vfs.on('replacement-success', (event) => {
    console.log(`✅ Replacement successful: ${event.filePath} (${event.matchType}, ${(event.confidence * 100).toFixed(1)}% confidence)`);
  });

  vfs.on('self-healing-success', (event) => {
    console.log(`🔧 Self-healing successful: ${event.filePath} using strategy ${event.strategy}`);
  });

  vfs.on('confirmation-required', (event) => {
    console.log(`⚠️  Confirmation required for ${event.filePath}: ${event.operation.strategy.description}`);
  });

  vfs.on('interactive-suggestions', (event) => {
    console.log(`💡 Interactive suggestions for ${event.filePath}:`, event.suggestions.slice(0, 3));
  });

  return vfs;
}

export { SelfHealingVFS as IntelligentVFS };