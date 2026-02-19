const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), '.gemini', 'experiments.json');

function readExperiments() {
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        flags: data.flags || [],
        experimentIds: data.experimentIds || []
      };
    } catch (e) {
      console.error('Failed to parse existing experiments.json, starting fresh.');
    }
  }
  return { flags: [], experimentIds: [] };
}

function writeExperiments(data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated local experiments at ${filePath}`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error('Usage: override_experiment.cjs <set|unset|clear> [flagId] [value]');
  process.exit(1);
}

const data = readExperiments();

if (command === 'clear') {
  data.flags = [];
  data.experimentIds = [];
  writeExperiments(data);
} else if (command === 'unset') {
  const flagId = parseInt(args[1], 10);
  data.flags = data.flags.filter(f => f.flagId !== flagId);
  writeExperiments(data);
} else if (command === 'set') {
  const flagId = parseInt(args[1], 10);
  const rawValue = args[2];
  
  if (isNaN(flagId) || rawValue === undefined) {
    console.error('Invalid arguments for set: requires numeric flagId and value');
    process.exit(1);
  }

  // Remove existing flag
  data.flags = data.flags.filter(f => f.flagId !== flagId);

  // Parse value
  const flag = { flagId };
  if (rawValue === 'true') flag.boolValue = true;
  else if (rawValue === 'false') flag.boolValue = false;
  else if (!isNaN(Number(rawValue))) flag.numberValue = Number(rawValue);
  else flag.stringValue = rawValue;

  data.flags.push(flag);
  writeExperiments(data);
} else {
  console.error('Unknown command');
  process.exit(1);
}
