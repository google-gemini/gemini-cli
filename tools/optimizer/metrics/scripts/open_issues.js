import { execSync } from 'node:child_process';

try {
  const output = execSync('gh issue list --state open --limit 1000 --json number', { encoding: 'utf-8' });
  const issues = JSON.parse(output);
  process.stdout.write(JSON.stringify({
    metric: 'open_issues',
    value: issues.length,
    timestamp: new Date().toISOString()
  }));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
