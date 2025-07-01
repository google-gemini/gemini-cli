const { execSync } = require('child_process');

try {
  const args = process.env.INPUT_ARGS;
  const output = execSync(`npx gemini ${args}`, { stdio: 'inherit' });
  console.log(output.toString());
} catch (error) {
  console.error('Error running Gemini CLI:', error);
  process.exit(1);
}
