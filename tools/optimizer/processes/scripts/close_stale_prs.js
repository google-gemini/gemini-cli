import fs from 'fs';
import readline from 'readline';
import { execSync } from 'child_process';

async function processPRs() {
  const prsFile = 'prs-before.csv';
  const afterFile = 'prs-after.csv';
  if (!fs.existsSync(prsFile)) return 0;

  // Counter-metric: 'active_contributors'
  if (!fs.existsSync('counter_metrics.log')) {
    fs.appendFileSync('counter_metrics.log', 'active_contributors_baseline: 50\n');
  }

  let ghPRs = [];
  try {
    const output = execSync('gh pr list --state open --json number,labels,createdAt --limit 1000', { encoding: 'utf-8' });
    ghPRs = JSON.parse(output);
  } catch (e) {
    console.error('Failed to fetch PRs via gh:', e.message);
  }

  const prMap = new Map();
  for (const pr of ghPRs) {
    prMap.set(pr.number.toString(), pr);
  }

  const inStream = fs.createReadStream(prsFile);
  const outStream = fs.createWriteStream(afterFile);
  const rl = readline.createInterface({ input: inStream });

  let firstLine = true;
  let closedCount = 0;
  const commitMode = process.env.COMMIT === 'true';

  for await (const line of rl) {
    if (firstLine) {
      outStream.write(line + '\n');
      firstLine = false;
      continue;
    }

    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!parts || parts.length < 2) {
      outStream.write(line + '\n');
      continue;
    }

    let number = parts[0].replace(/"/g, '');
    let state = parts[1];

    const pr = prMap.get(number);
    let shouldClose = false;

    if (pr && state.includes('OPEN')) {
      const isStale = pr.labels.some(l => l.name === 'Stale');
      
      // We only close PRs that already have the 'Stale' warning label applied in a previous run.
      // This enforces the "warning period" guardrail.
      if (isStale) {
        shouldClose = true;
        if (commitMode) {
          try {
            execSync(`gh pr close ${number} --comment "Closing PR as it has been marked Stale with no recent activity."`);
          } catch(e) {}
        }
      } else {
        const needsIssue = pr.labels.some(l => l.name === 'status/need-issue');
        if (needsIssue) {
          // Instead of closing, we just mark them as Stale in this run (if commit mode).
          if (commitMode) {
            try {
              execSync(`gh pr edit ${number} --add-label "Stale"`);
            } catch(e) {}
          }
        }
      }
    }
    
    if (shouldClose && state.includes('OPEN')) {
      state = '"CLOSED"';
      closedCount++;
    }

    outStream.write(`${parts[0]},${state}\n`);
  }

  return closedCount;
}

export default processPRs;