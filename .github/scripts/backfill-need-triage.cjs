/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */

/**
 * Script to backfill the 'status/need-triage' label to all open issues
 * that are NOT currently labeled with '🔒 maintainer only' or 'help wanted'.
 */

const { spawn, spawnSync } = require('child_process');

const isDryRun = process.argv.includes('--dry-run');
const REPO = 'google-gemini/gemini-cli';

/**
 * Checks if the GitHub CLI is installed and authenticated.
 */
function checkGhCli() {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('❌ GitHub CLI (gh) is not installed or not authenticated.');
    console.error(result.stderr);
    process.exit(1);
  }
}

async function main() {
  checkGhCli();

  if (isDryRun) {
    console.log('🧪 DRY RUN MODE ENABLED - No changes will be made.\n');
  }

  console.log(`🔍 Fetching and filtering open issues from ${REPO}...`);

  // We use the /issues endpoint with pagination to bypass the 1000-result limit of the Search API.
  // The jq filter ensures we:
  // 1. Exclude Pull Requests (.pull_request == null)
  // 2. Exclude issues with '🔒 maintainer only'
  // 3. Exclude issues with 'help wanted'
  // 4. Exclude issues that already have 'status/need-triage'
  const jqFilter =
    '.[] | select(.pull_request == null) | select([.labels[].name] as $l | (any($l[]; . == "🔒 maintainer only") | not) and (any($l[]; . == "help wanted") | not) and (any($l[]; . == "status/need-triage") | not)) | {number: .number, title: .title}';

  const gh = spawn('gh', [
    'api',
    `repos/${REPO}/issues?state=open&per_page=100`,
    '--paginate',
    '--jq',
    jqFilter,
  ]);

  let output = '';
  let errorOutput = '';

  gh.stdout.on('data', (data) => {
    output += data.toString();
  });

  gh.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  gh.on('close', async (code) => {
    if (code !== 0) {
      console.error(`❌ gh api failed with code ${code}: ${errorOutput}`);
      process.exit(1);
    }

    const issues = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
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
        // Validate issue number is a number to be extra safe
        const issueNumber = parseInt(issue.number, 10);
        if (isNaN(issueNumber)) {
          console.error(`❌ Invalid issue number received: ${issue.number}`);
          failCount++;
          continue;
        }

        console.log(`🏷️  Labeling issue #${issueNumber}: ${issue.title}`);

        // Use spawnSync with an argument array to prevent command injection.
        // shell: false is the default for spawnSync, ensuring no shell expansion occurs.
        const result = spawnSync(
          'gh',
          [
            'issue',
            'edit',
            issueNumber.toString(),
            '--add-label',
            'status/need-triage',
            '--repo',
            REPO,
          ],
          { encoding: 'utf8' },
        );

        if (result.status === 0) {
          successCount++;
        } else {
          console.error(
            `❌ Failed to label #${issueNumber}: ${result.stderr.trim()}`,
          );
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
  });
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
