/* eslint-disable */
/* global require, console, process */

/**
 * Script to backfill the 'status/need-triage' label to all open issues
 * that are NOT currently labeled with '🔒 maintainer only' or 'help wanted'.
 */

const { execFileSync } = require('child_process');

const isDryRun = process.argv.includes('--dry-run');
const REPO = 'google-gemini/gemini-cli';

/**
 * Executes a GitHub CLI command safely using an argument array to prevent command injection.
 * @param {string[]} args
 * @returns {string|null}
 */
function runGh(args) {
  try {
    // Using execFileSync with an array of arguments is safe as it doesn't use a shell.
    // We set a large maxBuffer (10MB) to handle repositories with many issues.
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? ` Stderr: ${error.stderr.trim()}` : '';
    console.error(
      `❌ Error running gh ${args.join(' ')}: ${error.message}${stderr}`,
    );
    return null;
  }
}

async function main() {
  console.log('🔐 GitHub CLI security check...');
  const authStatus = runGh(['auth', 'status']);
  if (authStatus === null) {
    console.error('❌ GitHub CLI (gh) is not installed or not authenticated.');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('🧪 DRY RUN MODE ENABLED - No changes will be made.\n');
  }

  console.log(`🔍 Fetching and filtering open issues from ${REPO}...`);

  // We use the /issues endpoint with pagination to bypass the 1000-result limit.
  // The jq filter ensures we exclude PRs, maintainer-only, help-wanted, and existing status/need-triage.
  const jqFilter =
    '.[] | select(.pull_request == null) | select([.labels[].name] as $l | (any($l[]; . == "🔒 maintainer only") | not) and (any($l[]; . == "help wanted") | not) and (any($l[]; . == "status/need-triage") | not)) | {number: .number, title: .title}';

  const output = runGh([
    'api',
    `repos/${REPO}/issues?state=open&per_page=100`,
    '--paginate',
    '--jq',
    jqFilter,
  ]);

  if (output === null) {
    process.exit(1);
  }

  const issues = output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_e) {
        console.error(`⚠️ Failed to parse line: ${line}`);
        return null;
      }
    })
    .filter(Boolean);

  console.log(`✅ Found ${issues.length} issues matching criteria.`);

  if (issues.length === 0) {
    console.log('✨ No issues need backfilling.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  if (isDryRun) {
    for (const issue of issues) {
      console.log(
        `[DRY RUN] Would label issue #${issue.number}: ${issue.title}`,
      );
    }
    successCount = issues.length;
  } else {
    console.log(`🏷️  Applying labels to ${issues.length} issues...`);

    for (const issue of issues) {
      const issueNumber = String(issue.number);
      console.log(`🏷️  Labeling issue #${issueNumber}: ${issue.title}`);

      const result = runGh([
        'issue',
        'edit',
        issueNumber,
        '--add-label',
        'status/need-triage',
        '--repo',
        REPO,
      ]);

      if (result !== null) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   - Success: ${successCount}`);
  console.log(`   - Failed:  ${failCount}`);

  if (failCount > 0) {
    console.error(`\n❌ Backfill completed with ${failCount} errors.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 ${isDryRun ? 'Dry run' : 'Backfill'} complete!`);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
