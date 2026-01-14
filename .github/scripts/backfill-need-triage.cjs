/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, process */

/**
 * Script to backfill the 'status/need-triage' label to all open issues
 * that are NOT currently labeled with '🔒 maintainer only' or 'help wanted'.
 */

const { spawn } = require('child_process');

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE ENABLED - No changes will be made.\n');
  }

  const repo = 'google-gemini/gemini-cli';
  console.log(`🔍 Fetching and filtering open issues from ${repo}...`);

  // We use the /issues endpoint with pagination. 
  // We use jq inside the shell command to filter out PRs and unwanted labels 
  // IMMEDIATELY so we don't blow out the buffer with thousands of full issue objects.
  // Note: we use "any" to check for existence of strings in the array.
  const jqFilter = '.[] | select(.pull_request == null) | select([.labels[].name] as $l | (any($l[]; . == "🔒 maintainer only") | not) and (any($l[]; . == "help wanted") | not) and (any($l[]; . == "status/need-triage") | not)) | {number: .number, title: .title}';
  
  const gh = spawn('gh', [
    'api',
    `repos/${repo}/issues?state=open&per_page=100`,
    '--paginate',
    '--jq',
    jqFilter
  ]);

  let output = '';
  let errorOutput = '';

  gh.stdout.on('data', (data) => {
    output += data.toString();
  });

  gh.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  gh.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ gh api failed with code ${code}: ${errorOutput}`);
      process.exit(1);
    }

    const issues = output.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error(`Failed to parse line: ${line}`);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`✅ Found ${issues.length} issues matching criteria.`);

    if (issues.length === 0) {
      console.log('✨ No issues need backfilling.');
      return;
    }

    if (isDryRun) {
      for (const issue of issues) {
        console.log(`[DRY RUN] Would label issue #${issue.number}: ${issue.title}`);
      }
    } else {
      console.log(`🏷️  Applying labels to ${issues.length} issues...`);
      const { execSync } = require('child_process');
      for (const issue of issues) {
        console.log(`🏷️  Labeling issue #${issue.number}: ${issue.title}`);
        try {
          execSync(`gh issue edit ${issue.number} --add-label "status/need-triage" --repo ${repo}`);
        } catch (e) {
          console.error(`❌ Failed to label #${issue.number}: ${e.message}`);
        }
      }
    }

    console.log(`\n🎉 ${isDryRun ? 'Dry run' : 'Backfill'} complete! Processed ${issues.length} issues.`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
