/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Forging the arcane terminal canvas
console.log(chalk.green('// Pyrmethus conjures the File Uploader!'));

async function uploadFile() {
  // Summoning the file path
  readline.question(
    chalk.blue(
      'Enter the file to upload (e.g., /data/data/com.termux/files/home/file.txt): ',
    ),
    async (filePath) => {
      if (!fs.existsSync(filePath)) {
        console.log(chalk.red(`The file '${filePath}' eludes the ether!`));
        readline.close();
        return;
      }
      // Summoning the server’s sacred URL
      readline.question(
        chalk.blue('Enter the server URL (e.g., https://example.com/upload): '),
        async (serverUrl) => {
          console.log(
            chalk.cyan(`// Channeling '${filePath}' to the server...`),
          );
          const form = new FormData();
          form.append(
            'file',
            fs.createReadStream(filePath),
            path.basename(filePath),
          );
          try {
            const response = await axios.post(serverUrl, form, {
              headers: form.getHeaders(),
            });
            console.log(
              chalk.green(
                `Success! '${filePath}' has ascended to the server: ${response.status}`,
              ),
            );
            console.log(chalk.yellow(`Server response: ${response.data}`));
          } catch (error) {
            console.log(chalk.red(`The ether resists: ${error.message}`));
          }
          readline.close();
        },
      );
    },
  );
}

uploadFile();
