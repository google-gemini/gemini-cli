const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  try {
    console.log('Fetching open issues for age analysis...');
    const issueOutput = execSync('gh issue list --state open --json createdAt --limit 1000', { encoding: 'utf-8' });
    const issues = JSON.parse(issueOutput);
    
    console.log('Fetching open PRs for age analysis...');
    const prOutput = execSync('gh pr list --state open --json createdAt --limit 1000', { encoding: 'utf-8' });
    const prs = JSON.parse(prOutput);
    
    const now = new Date();
    
    const calculateAgeBuckets = (items) => {
      const buckets = {
        '< 1 week': 0,
        '1-4 weeks': 0,
        '1-3 months': 0,
        '3-6 months': 0,
        '> 6 months': 0
      };
      
      for (const item of items) {
        const created = new Date(item.createdAt);
        const diffTime = Math.abs(now - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 7) buckets['< 1 week']++;
        else if (diffDays < 30) buckets['1-4 weeks']++;
        else if (diffDays < 90) buckets['1-3 months']++;
        else if (diffDays < 180) buckets['3-6 months']++;
        else buckets['> 6 months']++;
      }
      return buckets;
    };

    const issueBuckets = calculateAgeBuckets(issues);
    const prBuckets = calculateAgeBuckets(prs);
    
    let csvContent = 'type,age_bucket,count\n';
    for (const [bucket, count] of Object.entries(issueBuckets)) {
      csvContent += `issue,"${bucket}",${count}\n`;
    }
    for (const [bucket, count] of Object.entries(prBuckets)) {
      csvContent += `pr,"${bucket}",${count}\n`;
    }
    
    const csvPath = path.join(__dirname, '..', 'age_distribution.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log(`Saved findings to ${csvPath}`);
    
  } catch (error) {
    console.error('Error fetching age data:', error.message);
  }
}

run();
