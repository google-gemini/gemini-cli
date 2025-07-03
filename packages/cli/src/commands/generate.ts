import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI';

export async function generateCode(prompt: string): Promise<void> {
  console.log(chalk.green('// Pyrmethus conjures the Code Generator with Gemini’s aid!'));

  const suggestion = await MockGeminiAPI.getSuggestion('Generate code in TypeScript.');
  if (suggestion) console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!prompt) {
    console.log(chalk.red('The ether demands a prompt to weave code!'));
    return;
  }

  try {
    console.log(chalk.cyan(`// Forging code for prompt: '${prompt}'...`));
    // Simulate Gemini API response
    const code = `// Generated code for: ${prompt}\nconsole.log('Hello, Termux!');`;
    const outputPath = `/data/data/com.termux/files/home/generated_${Date.now()}.ts`;
    await fs.writeFile(outputPath, code);
    console.log(chalk.green(`Success! Code forged at '${outputPath}'.`));
  } catch (error: any) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug error: ${error.message}`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
