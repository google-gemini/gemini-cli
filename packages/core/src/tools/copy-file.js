const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

// Forging the arcane terminal canvas
console.log(chalk.green('// Pyrmethus conjures the File Copier!'));

async function copyFile() {
  // Summoning the source and destination paths
  readline.question(chalk.blue('Enter source path (e.g., /data/data/com.termux/files/home/file.txt): '), (srcPath) => {
    if (!fs.existsSync(srcPath)) {
      console.log(chalk.red(`The source '${srcPath}' eludes the ether!`));
      readline.close();
      return;
    }
    readline.question(chalk.blue('Enter destination path: '), async (destPath) => {
      if (fs.existsSync(destPath)) {
        readline.question(chalk.yellow(`'${destPath}' exists. Overwrite? (y/n): `), async (confirm) => {
          if (confirm.toLowerCase() !== 'y') {
            console.log(chalk.yellow('Copy aborted.'));
            readline.close();
            return;
          }
          await performCopy(srcPath, destPath);
        });
      } else {
        await performCopy(srcPath, destPath);
      }
    });
  });
}

async function performCopy(srcPath, destPath) {
  try {
    console.log(chalk.cyan(`// Copying '${srcPath}' to '${destPath}'...`));
    await fs.copy(srcPath, destPath, { overwrite: true });
    console.log(chalk.green(`Success! '${srcPath}' duplicated to '${destPath}'.`));
    readline.close();
  } catch (error) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    readline.close();
  }
}

copyFile();