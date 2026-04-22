import { execSync } from 'node:child_process';

try {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateString = sevenDaysAgo.toISOString().split('T')[0];
  
  const output = execSync(`gh run list --status failure --limit 1000 --json databaseId --created ">=${dateString}"`, { encoding: 'utf-8' });
  const runs = JSON.parse(output);
  process.stdout.write(JSON.stringify({
    metric: 'test_flakiness',
    value: runs.length,
    timestamp: new Date().toISOString()
  }));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
