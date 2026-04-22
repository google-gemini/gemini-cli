const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  try {
    console.log('Fetching open issues for assignee analysis...');
    const output = execSync('gh issue list --state open --json assignees --limit 1000', { encoding: 'utf-8' });
    const issues = JSON.parse(output);
    
    const assigneeCounts = {};
    for (const issue of issues) {
      if (issue.assignees && issue.assignees.length > 0) {
        for (const assignee of issue.assignees) {
          assigneeCounts[assignee.login] = (assigneeCounts[assignee.login] || 0) + 1;
        }
      } else {
        assigneeCounts['UNASSIGNED'] = (assigneeCounts['UNASSIGNED'] || 0) + 1;
      }
    }

    const sortedAssignees = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1]);
    
    let csvContent = 'assignee,count\n';
    for (const [assignee, count] of sortedAssignees) {
      csvContent += `"${assignee}",${count}\n`;
    }
    
    const csvPath = path.join(__dirname, '..', 'issue_assignees.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log(`Saved findings to ${csvPath}`);
    
  } catch (error) {
    console.error('Error fetching assignee data:', error.message);
  }
}

run();
