const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  try {
    console.log('Fetching open PRs...');
    // Fetch up to 1000 open PRs
    const output = execSync('gh pr list --state open --json labels,createdAt,author --limit 1000', { encoding: 'utf-8' });
    const prs = JSON.parse(output);
    
    console.log(`Total open PRs fetched: ${prs.length}`);
    
    const labelCounts = {};
    let communityPrCount = 0;
    
    for (const pr of prs) {
      // Assuming a simplistic check for community PRs: author is not a known bot/core team, or has specific labels
      if (pr.labels && pr.labels.length > 0) {
        for (const label of pr.labels) {
          labelCounts[label.name] = (labelCounts[label.name] || 0) + 1;
        }
      } else {
        labelCounts['NO_LABEL'] = (labelCounts['NO_LABEL'] || 0) + 1;
      }
    }

    const sortedLabels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]);
    console.log('\nLabel distribution for open PRs:');
    
    let csvContent = 'label,count\n';
    for (const [label, count] of sortedLabels) {
      console.log(`${label}: ${count}`);
      csvContent += `"${label}",${count}\n`;
    }
    
    const csvPath = path.join(__dirname, '..', 'pr_labels.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log(`Saved findings to ${csvPath}`);

  } catch (error) {
    console.error('Error fetching PRs:', error.message);
  }
}

run();
