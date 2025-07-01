/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiClient } from '../../core/client.js';
import { getResponseText } from '../../utils/generateContentResponseUtilities.js';
import { tokenLimit } from '../../core/tokenLimits.js';
import { AICommitResponse, CommitMessageParts, CommitAnalysis } from './types.js';
import { COMMIT_ANALYSIS_PROMPT, VALID_CHANGE_TYPES, MAX_DIFF_SIZE } from './constants.js';
import { Logger } from './logger.js';

export class CommitAnalyzer {
  constructor(
    private readonly client: GeminiClient,
    private readonly logger: Logger
  ) {}

  async analyzeChangesAndGenerateCommit(
    filesToBeCommitted: string[],
    diffOutput: string,
    logOutput: string,
    signal: AbortSignal
  ): Promise<string> {
    try {
      const limitedDiff = this.limitDiffSize(diffOutput);
      const prompt = this.buildAnalysisPrompt(filesToBeCommitted, limitedDiff, logOutput);
      
      this.logger.debug('Sending commit analysis request to AI', {
        filesCount: filesToBeCommitted.length,
        diffLength: limitedDiff.length,
        promptLength: prompt.length
      });

      const response = await this.client.generateContent(
        [{ parts: [{ text: prompt }] }],
        {
          maxOutputTokens: tokenLimit('gemini-1.5-flash'),
          temperature: 0.3,
          topP: 0.8,
        },
        signal
      );

      const responseText = getResponseText(response);
      if (!responseText) {
        throw new Error('AI generated empty response');
      }

      this.logger.debug('Received AI response', { responseLength: responseText.length });
      
      const analysis = this.parseAIResponse(responseText);
      const validationError = this.validateAIResponse(analysis);
      
      if (validationError) {
        throw new Error(validationError);
      }

      return this.buildCommitMessage(analysis.commitMessage);
    } catch (error) {
      this.logger.error('Failed to analyze changes and generate commit', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private limitDiffSize(diff: string): string {
    if (diff.length <= MAX_DIFF_SIZE) {
      return diff;
    }

    this.logger.warn('Diff size exceeded limit, truncating', {
      originalSize: diff.length,
      limitSize: MAX_DIFF_SIZE
    });

    const truncated = diff.substring(0, MAX_DIFF_SIZE);
    return truncated + '\n\n[... diff truncated due to size ...]';
  }

  private buildAnalysisPrompt(files: string[], diff: string, log: string): string {
    const recentCommits = log.split('\n').slice(0, 10).join('\n');
    
    return `${COMMIT_ANALYSIS_PROMPT}

## Files to be committed:
${files.map(file => `- ${file}`).join('\n')}

## Git diff:
\`\`\`
${diff}
\`\`\`

## Recent commit history (for context):
\`\`\`
${recentCommits}
\`\`\`

Please provide your analysis and commit message in the following JSON format:
\`\`\`json
{
  "analysis": {
    "changedFiles": ["file1.js", "file2.ts"],
    "changeType": "feat",
    "scope": "auth",
    "purpose": "Brief explanation of why this change was made",
    "impact": "Description of how this affects the project",
    "hasSensitiveInfo": false
  },
  "commitMessage": {
    "header": "feat(auth): add user authentication system",
    "body": "Implement JWT-based authentication with login and logout functionality.\\n\\nThis provides secure user session management and prepares the foundation for role-based access control.",
    "footer": "Fixes #123"
  }
}
\`\`\``;
  }

  private parseAIResponse(responseText: string): AICommitResponse {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (!jsonMatch) {
      throw new Error('AI response does not contain valid JSON format');
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      
      if (!parsed.analysis || !parsed.commitMessage) {
        throw new Error('AI response missing required fields (analysis or commitMessage)');
      }

      return parsed as AICommitResponse;
    } catch (error) {
      this.logger.error('Failed to parse AI JSON response', {
        error: error instanceof Error ? error.message : String(error),
        jsonContent: jsonMatch[1]
      });
      throw new Error(`Invalid JSON in AI response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateAIResponse(response: AICommitResponse): string | null {
    // Validate analysis
    if (!response.analysis.changedFiles || !Array.isArray(response.analysis.changedFiles)) {
      return 'AI response validation failed: changedFiles must be an array';
    }

    if (!VALID_CHANGE_TYPES.includes(response.analysis.changeType)) {
      return `AI response validation failed: invalid changeType '${response.analysis.changeType}'`;
    }

    // Validate commit message
    const headerError = this.validateCommitMessageHeader(response.commitMessage.header);
    if (headerError) return headerError;

    if (response.commitMessage.body) {
      const bodyError = this.validateCommitMessageBody(response.commitMessage.body);
      if (bodyError) return bodyError;
    }

    if (response.commitMessage.footer) {
      const footerError = this.validateCommitMessageFooter(response.commitMessage.footer);
      if (footerError) return footerError;
    }

    return null;
  }

  private validateCommitMessageHeader(header: string): string | null {
    if (!header || header.trim().length === 0) {
      return 'AI response validation failed: commit header cannot be empty';
    }

    if (header.length > 72) {
      return `AI response validation failed: commit header too long (${header.length} chars, max 72)`;
    }

    const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?: .+/;
    if (!conventionalCommitRegex.test(header)) {
      return 'AI response validation failed: commit header must follow conventional commits format';
    }

    return null;
  }

  private validateCommitMessageBody(body: string): string | null {
    if (body.trim().length === 0) {
      return null; // Empty body is valid
    }

    const bodyLines = body.split('\n');
    for (const line of bodyLines) {
      if (line.trim().length === 0) continue;
      
      if (line.length > 200) {
        return 'AI response validation failed: commit message body line is exceptionally long (>200 chars)';
      }
    }

    return null;
  }

  private validateCommitMessageFooter(footer: string): string | null {
    if (footer.trim().length === 0) {
      return null; // Empty footer is valid
    }

    const footerLines = footer.split('\n');
    for (const line of footerLines) {
      if (line.trim().length === 0) continue;
      
      if (line.length > 200) {
        return 'AI response validation failed: footer line is exceptionally long (>200 chars)';
      }
      
      if (line.match(/^BREAKING CHANGE:\s*$/)) {
        return 'AI response validation failed: BREAKING CHANGE footer must include a description';
      }
    }

    return null;
  }

  private buildCommitMessage(commitParts: CommitMessageParts): string {
    let message = commitParts.header;
    
    if (commitParts.body && commitParts.body.trim()) {
      message += '\n\n' + commitParts.body.trim();
    }
    
    if (commitParts.footer && commitParts.footer.trim()) {
      message += '\n\n' + commitParts.footer.trim();
    }
    
    return message;
  }
}