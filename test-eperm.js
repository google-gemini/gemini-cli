const { spawnSync } = require('child_process');
const { execSync } = require('child_process');

const result = spawnSync('sandbox-exec', ['-p', '(version 1)(allow default)(deny file-write* (literal "/tmp/test-sandbox-file.txt"))', 'bash', '-c', 'echo "hello" > /tmp/test-sandbox-file.txt']);

console.log('Exit Code:', result.status);
console.log('Signal:', result.signal);
console.log('Stderr:', result.stderr.toString());

const pid = result.pid;
try {
  const log = execSync(`log show --predicate 'process == "sandboxd" and eventMessage contains "${pid}"' --last 1m --style compact`);
  console.log('Log:', log.toString());
} catch (e) {
  console.log('Log Error:', e.toString());
}
