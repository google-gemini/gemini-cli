import chalk from 'chalk';
import fs from 'fs-extra';
import { MockGeminiAPI } from '../utils/mockGeminiAPI';

export async function explainCode(codeOrPath: string): Promise<void> {
  console.log(chalk.green('// Pyrmethus conjures the Code Explainer with Gemini’s aid!'));

  const suggestion = await MockGeminiAPI.getSuggestion('Explain code in TypeScript.');
  if (suggestion) console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  let code: string;
  if (fs.existsSync(codeOrPath)) {
    code = await fs.readFile(codeOrPath, 'utf-8');
  } else {
    code = codeOrPath;
  }

  if (!code) {
    console.log(chalk.red('The ether requires code or a valid file path!'));
    return;
  }

  try {
    console.log(chalk.cyan(`// Explaining code: ${code.substring(0, 50)}...`));
    // Simulate Gemini API explanation
    const explanation = `This code appears to be a ${code.includes('console.log') ? 'JavaScript/TypeScript snippet' : 'generic script'}. It outputs content to the console.`;
    console.log(chalk.yellow(explanation));
    console.log(chalk.green('Explanation complete.'));
  } catch (error: any) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug error: ${error.message}`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
