const { execFileSync } = require('child_process');

try {
  // Split INPUT_ARGS into an array (simple whitespace split)
  const args = process.env.INPUT_ARGS || '';
  const commandArgs = args.trim() ? args.split(/\s+/) : [];

  // Invoke `npx gemini` with execFileSync to avoid shell injection
  execFileSync('npx', ['gemini', ...commandArgs], { stdio: 'inherit' });
} catch (error) {
  console.error(`Error running Gemini CLI: ${error.message}`);
  process.exit(error.status || 1);
}
