const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  try {
    // Fetch 1000 open issues
    console.log('Fetching open issues...');
    const output = execSync('gh issue list --state open --json labels --limit 1000', { encoding: 'utf-8' });
    const issues = JSON.parse(output);
    
    const labelCounts = {};
    for (const issue of issues) {
      if (issue.labels && issue.labels.length > 0) {
        for (const label of issue.labels) {
          labelCounts[label.name] = (labelCounts[label.name] || 0) + 1;
        }
      } else {
        labelCounts['NO_LABEL'] = (labelCounts['NO_LABEL'] || 0) + 1;
      }
    }

    const sortedLabels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]);
    console.log('Label distribution for open issues:');
    
    let csvContent = 'label,count\n';
    for (const [label, count] of sortedLabels) {
      console.log(`${label}: ${count}`);
      csvContent += `"${label}",${count}\n`;
    }
    
    const csvPath = path.join(__dirname, '..', 'issue_labels.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log(`Saved findings to ${csvPath}`);
    
  } catch (error) {
    console.error('Error fetching issues:', error.message);
  }
}

run();
