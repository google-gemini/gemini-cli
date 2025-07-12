import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run() {
  try {
    const command = core.getInput('command');
    await exec.exec('npx', ['@google/gemini-cli', ...command.split(' ')]);
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
