import { execSync } from 'child_process';

try {
  const result = execSync(
    'npx vitest run src/tools/mcp-client.test.ts --reporter=json',
    {
      cwd: 'packages/core',
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  console.log(result);
} catch (error) {
  // vitest returns non-zero when tests fail, so we capture stdout here
  console.log(error.stdout);
}
