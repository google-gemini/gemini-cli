#!/usr/bin/env node

/**
 * Script to backfill the 'status/need-triage' label to all open issues
 * that are NOT currently labeled with '🔒 maintainer only'.
 */

const { execSync } = require('child_process');

function runGh(command) {
  try {
    return execSync(`gh ${command}`, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`Error running gh ${command}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Fetching open issues without the "🔒 maintainer only" label...');

  // Search for open issues that do NOT have the maintainer label
  const query = 'is:open is:issue -label:"🔒 maintainer only" -label:"status/need-triage"';
  const issuesJson = runGh(`issue list --search '${query}' --limit 1000 --json number,title`);

  if (!issuesJson) {
    console.error('❌ Failed to fetch issues.');
    process.exit(1);
  }

  const issues = JSON.parse(issuesJson);
  console.log(`✅ Found ${issues.length} issues to process.`);

  if (issues.length === 0) {
    console.log('✨ No issues need backfilling.');
    return;
  }

  for (const issue of issues) {
    console.log(`🏷️  Labeling issue #${issue.number}: ${issue.title}`);
    runGh(`issue edit ${issue.number} --add-label "status/need-triage"`);
  }

  console.log('\n🎉 Backfill complete!');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
