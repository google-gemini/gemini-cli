/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Helper function to run the patch-create-comment script with given parameters
 */
function runPatchCreateComment(args, env = {}) {
  const scriptPath = join(
    process.cwd(),
    'scripts/releasing/patch-create-comment.js',
  );
  const fullEnv = {
    ...process.env,
    TEST_MODE: 'true', // Always run in test mode to avoid GitHub API calls
    ...env,
  };

  try {
    const result = execSync(`node ${scriptPath} ${args}`, {
      encoding: 'utf8',
      env: fullEnv,
    });
    return { stdout: result, stderr: '', success: true };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      success: false,
      code: error.status,
    };
  }
}

describe('patch-create-comment', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });
  describe('Environment Variable vs File Reading', () => {
    it('should prefer LOG_CONTENT environment variable over file', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit abc1234 --channel preview --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.5.3/preview/cherry-pick-abc1234 from release/v0.5.3',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('🚀 **Patch PR Created!**');
      expect(result.stdout).toContain('Channel**: `preview`');
      expect(result.stdout).toContain('Commit**: `abc1234`');
    });

    it('should use empty log content when LOG_CONTENT is not set', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit abc1234 --channel stable --repository google-gemini/gemini-cli --test',
        {}, // No LOG_CONTENT env var
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('❌ **Patch creation failed!**');
      expect(result.stdout).toContain(
        'There was an error creating the patch release',
      );
    });
  });

  describe('Log Content Parsing - Success Scenarios', () => {
    it('should generate success comment for clean cherry-pick', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit abc1234 --channel stable --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.4.1/stable/cherry-pick-abc1234 from release/v0.4.1\n✅ Cherry-pick successful - no conflicts detected',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('🚀 **Patch PR Created!**');
      expect(result.stdout).toContain('Channel**: `stable`');
      expect(result.stdout).toContain('Commit**: `abc1234`');
      expect(result.stdout).not.toContain('⚠️ Status');
    });

    it('should generate conflict comment for cherry-pick with conflicts', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit def5678 --channel preview --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.5.0-preview.2/preview/cherry-pick-def5678 from release/v0.5.0-preview.2\nCherry-pick has conflicts in 2 file(s):\nCONFLICT (content): Merge conflict in package.json',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('🚀 **Patch PR Created!**');
      expect(result.stdout).toContain(
        '⚠️ Status**: Cherry-pick conflicts detected',
      );
      expect(result.stdout).toContain(
        '⚠️ **Resolve conflicts** in the hotfix PR first',
      );
      expect(result.stdout).toContain('Channel**: `preview`');
    });
  });

  describe('Log Content Parsing - Existing PR Scenarios', () => {
    it('should detect existing PR and generate appropriate comment', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit ghi9012 --channel stable --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Hotfix branch hotfix/v0.4.1/stable/cherry-pick-ghi9012 already has an open PR.\nFound existing PR #8700: https://github.com/google-gemini/gemini-cli/pull/8700',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('ℹ️ **Patch PR already exists!**');
      expect(result.stdout).toContain(
        'A patch PR for this change already exists: [#8700](https://github.com/google-gemini/gemini-cli/pull/8700)',
      );
      expect(result.stdout).toContain(
        'Review and approve the existing patch PR',
      );
    });

    it('should detect branch exists but no PR scenario', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit jkl3456 --channel preview --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Hotfix branch hotfix/v0.5.0-preview.2/preview/cherry-pick-jkl3456 exists but has no open PR.\nHotfix branch hotfix/v0.5.0-preview.2/preview/cherry-pick-jkl3456 already exists.',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain(
        'ℹ️ **Patch branch exists but no PR found!**',
      );
      expect(result.stdout).toContain(
        'Delete the branch: `git branch -D hotfix/v0.5.0-preview.2/preview/cherry-pick-jkl3456`',
      );
      expect(result.stdout).toContain('Run the patch command again');
    });
  });

  describe('Log Content Parsing - Failure Scenarios', () => {
    it('should generate failure comment when exit code is non-zero', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit mno7890 --channel stable --repository google-gemini/gemini-cli --run-id 12345 --test',
        {
          LOG_CONTENT: 'Error: Failed to create patch',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('❌ **Patch creation failed!**');
      expect(result.stdout).toContain(
        'There was an error creating the patch release',
      );
      expect(result.stdout).toContain(
        'View workflow run](https://github.com/google-gemini/gemini-cli/actions/runs/12345)',
      );
    });

    it('should generate fallback failure comment when no output is generated', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit pqr4567 --channel preview --repository google-gemini/gemini-cli --run-id 67890 --test',
        {
          LOG_CONTENT: '',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('❌ **Patch creation failed!**');
      expect(result.stdout).toContain(
        'There was an error creating the patch release',
      );
    });
  });

  describe('Channel and NPM Tag Detection', () => {
    it('should correctly map stable channel to latest npm tag', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit stu8901 --channel stable --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.4.1/stable/cherry-pick-stu8901 from release/v0.4.1',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('will publish to npm tag `latest`');
    });

    it('should correctly map preview channel to preview npm tag', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit vwx2345 --channel preview --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.5.0-preview.2/preview/cherry-pick-vwx2345 from release/v0.5.0-preview.2',
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('will publish to npm tag `preview`');
    });
  });

  describe('No Original PR Scenario', () => {
    it('should skip comment when no original PR is specified', () => {
      const result = runPatchCreateComment(
        '--original-pr 0 --exit-code 0 --commit yza6789 --channel stable --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT:
            'Creating hotfix branch hotfix/v0.4.1/stable/cherry-pick-yza6789 from release/v0.4.1',
          ORIGINAL_PR: '', // Override with empty PR
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain(
        'No original PR specified, skipping comment',
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle empty LOG_CONTENT gracefully', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit bcd0123 --channel stable --repository google-gemini/gemini-cli --test',
        { LOG_CONTENT: '' }, // Empty log content
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('❌ **Patch creation failed!**');
      expect(result.stdout).toContain(
        'There was an error creating the patch release',
      );
    });
  });

  describe('GitHub App Permission Scenarios', () => {
    it('should parse manual commands with clipboard emoji correctly', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit abc1234 --channel stable --repository google-gemini/gemini-cli --test',
        {
          LOG_CONTENT: `❌ Failed to create release branch due to insufficient GitHub App permissions.

📋 Please run these commands manually to create the branch:

\`\`\`bash
git checkout -b hotfix/v0.4.1/stable/cherry-pick-abc1234 v0.4.1
git push origin hotfix/v0.4.1/stable/cherry-pick-abc1234
\`\`\``,
        },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('🔒 **GitHub App Permission Issue**');
      expect(result.stdout).toContain(
        'Please run these commands manually to create the release branch:',
      );
      expect(result.stdout).toContain(
        'git checkout -b hotfix/v0.4.1/stable/cherry-pick-abc1234 v0.4.1',
      );
      expect(result.stdout).toContain(
        'git push origin hotfix/v0.4.1/stable/cherry-pick-abc1234',
      );
    });
  });

  describe('Test Mode Flag', () => {
    it('should generate mock content in test mode for success', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 0 --commit efg4567 --channel preview --repository google-gemini/gemini-cli --test',
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain(
        '🧪 TEST MODE - No API calls will be made',
      );
      expect(result.stdout).toContain('🚀 **Patch PR Created!**');
    });

    it('should generate mock content in test mode for failure', () => {
      const result = runPatchCreateComment(
        '--original-pr 8655 --exit-code 1 --commit hij8901 --channel stable --repository google-gemini/gemini-cli --test',
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('❌ **Patch creation failed!**');
    });
  });
});
