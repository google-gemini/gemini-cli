// packages/cli/src/commands/depCheck.ts
// Pyrmethus, the Termux Coding Wizard, conjures a spell to manage project dependencies.

import { Command } from '@oclif/core'; // Args not used if static args = {}
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
// Import tools and Config
import {
  ShellTool,
  Config,
  // Logger, // Oclif's logger is used
  ApprovalMode,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  TelemetryTarget
} from '@google/gemini-cli-core';
// import os from 'os'; // No longer needed for Config construction here



// Chromatic constants for enchanted logging
const NG = chalk.green.bold; // Success
const NB = chalk.cyan.bold; // Information
const NP = chalk.magenta.bold; // Headers, prompts
const NY = chalk.yellow.bold; // Warnings
const NR = chalk.red.bold; // Errors
const RST = chalk.reset; // Reset

export default class DepCheck extends Command {
  static description = `${NP}Verifies and manages project dependencies for Node.js and Python projects.${RST}`;

  static examples = [`${NG}<%= config.bin %> <%= command.id %>${RST}`];

  // No arguments for this command
  static args = {};

  private shellTool: ShellTool;
  private commandConfig: Config;

  constructor(argv: string[], config: any) {
    super(argv, config);
    const configParams: import('@google/gemini-cli-core').ConfigParameters = {
      sessionId: 'dep-check-session',
      targetDir: process.cwd(),
      approvalMode: ApprovalMode.DEFAULT,
      model: DEFAULT_GEMINI_MODEL,
      embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
      debugMode: false,
      fullContext: false,
      mcpServers: {},
      excludeTools: [],
      telemetry: {
        enabled: false,
        target: TelemetryTarget.LOCAL,
        otlpEndpoint: undefined,
        logPrompts: false,
      },
      checkpointing: false,
      cwd: process.cwd(),
    };
    this.commandConfig = new Config(configParams);
    this.shellTool = new ShellTool(this.commandConfig);
  }

  public async run(): Promise<void> {
    this.log(NP + 'Summoning the dependency spirits...' + RST);

    const projectRoot = process.cwd(); // The current working directory is the project root

    if (this.isNodeJsProject(projectRoot)) {
      await this.checkNodeJsDependencies(projectRoot);
    } else if (this.isPythonProject(projectRoot)) {
      await this.checkPythonDependencies(projectRoot);
    } else {
      this.log(
        NY +
          'No Node.js (package.json) or Python (requirements.txt) project detected in this realm.' +
          RST,
      );
    }

    this.log(NG + 'Dependency check complete. The ether is clear.' + RST);
  }

  private isNodeJsProject(projectRoot: string): boolean {
    return existsSync(join(projectRoot, 'package.json'));
  }

  private isPythonProject(projectRoot: string): boolean {
    return existsSync(join(projectRoot, 'requirements.txt'));
  }

  private async checkNodeJsDependencies(projectRoot: string): Promise<void> {
    this.log(NB + 'Channeling Node.js dependencies...' + RST);
    try {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Helper to extract text from PartListUnion
      const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
        if (!parts) return "";
        let textContent = "";
        const partArray = Array.isArray(parts) ? parts : [parts];

        for (const part of partArray) {
          if (typeof part === 'string') {
            textContent += part;
          } else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            textContent += part.text;
          }
        }
        return textContent;
      };

      const result = await this.shellTool.execute({
        command: 'npm list --json --depth=0',
        description: 'Listing installed Node.js packages',
        directory: projectRoot,
      }, new AbortController().signal);

      const llmTextOutput = getTextFromParts(result.llmContent);
      let npmLsOutput = "";
      // Assuming the primary output (stdout) is what we need from llmTextOutput
      // This parsing is fragile and depends on ShellTool's llmContent format
      const lines = llmTextOutput.split('\n');
      lines.forEach(line => {
        if (line.startsWith("Stdout: ")) npmLsOutput = line.substring("Stdout: ".length).trim();
      });
      if (npmLsOutput === "(empty)") npmLsOutput = "";

      if (!npmLsOutput) {
        this.log(NR + "Failed to get npm list output." + RST);
        // Check for Stderr if stdout is empty
        let npmLsError = "";
        lines.forEach(line => {
            if (line.startsWith("Stderr: ")) npmLsError = line.substring("Stderr: ".length).trim();
        });
        if (npmLsError && npmLsError !== "(empty)") {
            this.log(NR + "npm list error: " + npmLsError + RST);
        }
        return;
      }

      const installedPackages = JSON.parse(npmLsOutput).dependencies || {};

      this.log(NP + '--- Node.js Dependency Report ---' + RST);
      let missingCount = 0;
      let outdatedCount = 0;

      for (const depName in dependencies) {
        const requiredVersion = dependencies[depName];
        const installedInfo = installedPackages[depName];

        if (!installedInfo) {
          this.log(
            `${NR}Missing: ${depName} (Required: ${requiredVersion})${RST}`,
          );
          missingCount++;
        } else {
          const installedVersion = installedInfo.version;
          // Simple version check: just compare if exact match for now.
          // More robust version comparison (semver) can be added later.
          if (
            requiredVersion.startsWith('^') ||
            requiredVersion.startsWith('~')
          ) {
            // For simplicity, if it's a caret or tilde version, we'll just check if the major version matches.
            // A full semver comparison would be more complex.
            const requiredMajor = parseInt(
              requiredVersion.replace(/[^0-9.]/g, '').split('.')[0],
            );
            const installedMajor = parseInt(installedVersion.split('.')[0]);
            if (requiredMajor !== installedMajor) {
              this.log(
                `${NY}Outdated: ${depName} (Required: ${requiredVersion}, Installed: ${installedVersion})${RST}`,
              );
              outdatedCount++;
            }
          } else if (requiredVersion !== installedVersion) {
            this.log(
              `${NY}Outdated: ${depName} (Required: ${requiredVersion}, Installed: ${installedVersion})${RST}`,
            );
            outdatedCount++;
          } else {
            this.log(
              `${NG}Installed: ${depName} (Version: ${installedVersion})${RST}`,
            );
          }
        }
      }

      if (missingCount > 0) {
        this.log(
          NY +
            `
Found ${missingCount} missing Node.js dependencies. Consider running: ${NG}npm install${RST}`,
        );
      }
      if (outdatedCount > 0) {
        this.log(
          NY +
            `Found ${outdatedCount} outdated Node.js dependencies. Consider running: ${NG}npm update${RST}`,
        );
      }
      if (missingCount === 0 && outdatedCount === 0) {
        this.log(NG + 'All Node.js dependencies are in harmony.' + RST);
      }
    } catch (error: any) {
      this.log(
        `${NR}Failed to check Node.js dependencies: ${error.message}${RST}`,
      );
    }
  }

  private async checkPythonDependencies(projectRoot: string): Promise<void> {
    this.log(NB + 'Channeling Python dependencies...' + RST);
    try {
      const requirementsTxtPath = join(projectRoot, 'requirements.txt');
      const requiredPackages = readFileSync(requirementsTxtPath, 'utf8')
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('#'));

      // Helper to extract text from PartListUnion (can be defined at class/module level)
      const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
        if (!parts) return "";
        let textContent = "";
        const partArray = Array.isArray(parts) ? parts : [parts];

        for (const part of partArray) {
          if (typeof part === 'string') {
            textContent += part;
          } else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            textContent += part.text;
          }
        }
        return textContent;
      };

      const resultPip = await this.shellTool.execute({
        command: 'pip freeze',
        description: 'Listing installed Python packages',
        directory: projectRoot,
      }, new AbortController().signal);

      const llmTextOutputPip = getTextFromParts(resultPip.llmContent);
      let pipFreezeOutput = "";
      const linesPip = llmTextOutputPip.split('\n');
      linesPip.forEach(line => {
        if (line.startsWith("Stdout: ")) pipFreezeOutput = line.substring("Stdout: ".length).trim();
      });
      if (pipFreezeOutput === "(empty)") pipFreezeOutput = "";

      if (!pipFreezeOutput && !resultPip.llmContent) { // Check if llmContent itself is empty if stdout parsing fails
          this.log(NR + "Failed to get pip freeze output." + RST);
           let pipFreezeError = "";
            linesPip.forEach(line => {
                if (line.startsWith("Stderr: ")) pipFreezeError = line.substring("Stderr: ".length).trim();
            });
            if (pipFreezeError && pipFreezeError !== "(empty)") {
                this.log(NR + "pip freeze error: " + pipFreezeError + RST);
            }
          return;
      }

      const installedPackages = pipFreezeOutput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const installedPackageMap: { [key: string]: string } = {};
      installedPackages.forEach((pkg: string) => {
        const [name, version] = pkg.split('==');
        if (name && version) {
          installedPackageMap[name] = version;
        }
      });

      this.log(NP + '--- Python Dependency Report ---' + RST);
      let missingCount = 0;
      let outdatedCount = 0;

      for (const requiredPkg of requiredPackages) {
        const [name, versionSpec] = requiredPkg.split('==');
        const installedVersion = installedPackageMap[name];

        if (!installedVersion) {
          this.log(
            `${NR}Missing: ${name} (Required: ${versionSpec || 'any'})${RST}`,
          );
          missingCount++;
        } else {
          if (versionSpec && installedVersion !== versionSpec) {
            this.log(
              `${NY}Outdated: ${name} (Required: ${versionSpec}, Installed: ${installedVersion})${RST}`,
            );
            outdatedCount++;
          } else {
            this.log(
              `${NG}Installed: ${name} (Version: ${installedVersion})${RST}`,
            );
          }
        }
      }

      if (missingCount > 0) {
        this.log(
          NY +
            `
Found ${missingCount} missing Python dependencies. Consider running: ${NG}pip install -r requirements.txt${RST}`,
        );
      }
      if (outdatedCount > 0) {
        this.log(
          NY +
            `Found ${outdatedCount} outdated Python dependencies. Consider running: ${NG}pip install --upgrade -r requirements.txt${RST}`,
        );
      }
      if (missingCount === 0 && outdatedCount === 0) {
        this.log(NG + 'All Python dependencies are in harmony.' + RST);
      }
    } catch (error: any) {
      this.log(
        `${NR}Failed to check Python dependencies: ${error.message}${RST}`,
      );
    }
  }
}
