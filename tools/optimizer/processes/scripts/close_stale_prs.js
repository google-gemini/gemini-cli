import fs from 'fs';
import readline from 'readline';

async function processPRs() {
  const prsFile = 'prs-before.csv';
  const afterFile = 'prs-after.csv';
  if (!fs.existsSync(prsFile)) return 0;

  const inStream = fs.createReadStream(prsFile);
  const outStream = fs.createWriteStream(afterFile);
  const rl = readline.createInterface({ input: inStream });

  let firstLine = true;
  let closedCount = 0;

  for await (const line of rl) {
    if (firstLine) {
      outStream.write(line + '\n');
      firstLine = false;
      continue;
    }

    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!parts || parts.length < 3) {
      outStream.write(line + '\n');
      continue;
    }

    let [number, title, state] = parts;
    const titleLower = title.toLowerCase();

    // Close PRs with 'bump', 'chore', 'update readme', etc. if they're OPEN
    // Expanded with findings from investigations
    let shouldClose = titleLower.includes('update readme') || titleLower.includes('test') || titleLower.includes('draft') || titleLower.includes('chore') || titleLower.includes('bump') || titleLower.includes('wip');
    
    if (shouldClose && state.includes('OPEN')) {
      state = '"CLOSED"';
      closedCount++;
    }

    outStream.write(`${number},${title},${state}\n`);
  }

  return closedCount;
}

export default processPRs;