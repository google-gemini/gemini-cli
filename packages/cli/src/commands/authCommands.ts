/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

export interface AuthCommandArgs {
  action: 'login' | 'logout' | 'status';
  hfToken?: string;
  verbose?: boolean;
}

const AUTH_CONFIG_DIR = path.join(homedir(), '.trustcli');
const AUTH_CONFIG_FILE = path.join(AUTH_CONFIG_DIR, 'auth.json');

interface AuthConfig {
  huggingfaceToken?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class AuthCommandHandler {
  async handle(args: AuthCommandArgs): Promise<void> {
    await this.ensureConfigDir();
    
    switch (args.action) {
      case 'login':
        await this.handleLogin(args);
        break;
      case 'logout':
        await this.handleLogout();
        break;
      case 'status':
        await this.handleStatus();
        break;
      default:
        console.error(chalk.red(`Unknown auth action: ${args.action}`));
        process.exit(1);
    }
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(AUTH_CONFIG_DIR, { recursive: true });
  }

  private async handleLogin(args: AuthCommandArgs): Promise<void> {
    if (!args.hfToken) {
      console.error(chalk.red('❌ No token provided. Use: trust auth login --hf-token YOUR_TOKEN'));
      console.log(chalk.gray('\nGet your token from: https://huggingface.co/settings/tokens'));
      process.exit(1);
    }

    const spinner = ora('Saving authentication...').start();

    try {
      // Validate token format (basic check)
      if (!args.hfToken.startsWith('hf_') || args.hfToken.length < 20) {
        spinner.fail('Invalid token format');
        console.error(chalk.red('Token should start with "hf_" and be at least 20 characters'));
        process.exit(1);
      }

      const authConfig: AuthConfig = {
        huggingfaceToken: args.hfToken,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(AUTH_CONFIG_FILE, JSON.stringify(authConfig, null, 2), 'utf-8');
      
      // Set secure permissions (readable only by owner)
      await fs.chmod(AUTH_CONFIG_FILE, 0o600);

      spinner.succeed('Authentication saved successfully');
      console.log(chalk.green('✅ Hugging Face token stored securely'));
      console.log(chalk.gray(`📁 Config location: ${AUTH_CONFIG_FILE}`));
      console.log('\n' + chalk.blue('You can now download restricted models:'));
      console.log('  trust model download llama-3.2-3b-instruct');
      console.log('  trust model download phi-3.5-mini-instruct');
    } catch (error) {
      spinner.fail('Failed to save authentication');
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  }

  private async handleLogout(): Promise<void> {
    const spinner = ora('Removing authentication...').start();

    try {
      const exists = await this.configExists();
      if (!exists) {
        spinner.info('No authentication found');
        return;
      }

      await fs.unlink(AUTH_CONFIG_FILE);
      spinner.succeed('Authentication removed');
      console.log(chalk.green('✅ Hugging Face token deleted'));
    } catch (error) {
      spinner.fail('Failed to remove authentication');
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  }

  private async handleStatus(): Promise<void> {
    try {
      const authConfig = await this.loadAuthConfig();
      
      if (!authConfig || !authConfig.huggingfaceToken) {
        console.log(chalk.yellow('⚠️  No authentication configured'));
        console.log(chalk.gray('\nTo authenticate, run:'));
        console.log('  trust auth login --hf-token YOUR_TOKEN');
        console.log(chalk.gray('\nGet your token from: https://huggingface.co/settings/tokens'));
        return;
      }

      console.log(chalk.green('✅ Hugging Face authentication active'));
      console.log(chalk.gray(`Token: hf_${'*'.repeat(authConfig.huggingfaceToken.length - 7)}...`));
      console.log(chalk.gray(`Configured: ${new Date(authConfig.createdAt!).toLocaleString()}`));
      console.log('\n' + chalk.blue('Available restricted models:'));
      console.log('  • llama-3.2-3b-instruct');
      console.log('  • llama-3.1-8b-instruct');
      console.log('  • phi-3.5-mini-instruct');
    } catch (error) {
      console.error(chalk.red('❌ Error checking authentication status'));
      console.error(chalk.red(`Error: ${error}`));
    }
  }

  private async configExists(): Promise<boolean> {
    try {
      await fs.access(AUTH_CONFIG_FILE);
      return true;
    } catch {
      return false;
    }
  }

  async loadAuthConfig(): Promise<AuthConfig | null> {
    try {
      const exists = await this.configExists();
      if (!exists) return null;

      const content = await fs.readFile(AUTH_CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as AuthConfig;
    } catch {
      return null;
    }
  }

  static async getHuggingFaceToken(): Promise<string | undefined> {
    try {
      const handler = new AuthCommandHandler();
      const config = await handler.loadAuthConfig();
      return config?.huggingfaceToken;
    } catch {
      return undefined;
    }
  }
}

export async function handleAuthCommand(args: AuthCommandArgs): Promise<void> {
  const handler = new AuthCommandHandler();
  await handler.handle(args);
}