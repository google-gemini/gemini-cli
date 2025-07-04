/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Forging the radiant terminal glow
console.log(chalk.green('// Pyrmethus invokes the File Mover!'));

async function moveFile() {
  // Summoning the source and destination paths
  readline.question(
    chalk.blue(
      'Enter source path (e.g., /data/data/com.termux/files/home/file.txt): ',
    ),
    (srcPath) => {
      if (!fs.existsSync(srcPath)) {
        console.log(chalk.red(`The source '${srcPath}' eludes the ether!`));
        readline.close();
        return;
      }
      readline.question(
        chalk.blue('Enter destination path: '),
        async (destPath) => {
          if (fs.existsSync(destPath)) {
            readline.question(
              chalk.yellow(`'${destPath}' exists. Overwrite? (y/n): `),
              async (confirm) => {
                if (confirm.toLowerCase() !== 'y') {
                  console.log(chalk.yellow('Move aborted.'));
                  readline.close();
                  return;
                }
                await performMove(srcPath, destPath);
              },
            );
          } else {
            await performMove(srcPath, destPath);
          }
        },
      );
    },
  );
}

async function performMove(srcPath, destPath) {
  try {
    console.log(chalk.cyan(`// Shifting '${srcPath}' to '${destPath}'...`));
    await fs.move(srcPath, destPath, { overwrite: true });
    console.log(
      chalk.green(`Success! '${srcPath}' has transcended to '${destPath}'.`),
    );
    readline.close();
  } catch (error) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    readline.close();
  }
}

moveFile();
